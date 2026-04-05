const Analytics = require("./models/Analytics");
const { DateTime } = require("luxon");

const HEAT_KEYS = [
  "page_home",
  "page_chat",
  "action_chat_start",
  "action_message",
  "action_skip",
  "action_group_join",
  "cta_click"
];

const TRACKABLE_NUM_FIELDS = new Set([
  "homepageViews",
  "chatPageViews",
  "chatStarts",
  "matches",
  "skips",
  "reports",
  "messagesSent",
  "imagesSent",
  "totalChatDurationMs",
  "completedChats",
  "uniqueUsers"
]);

function defaultHeatmap() {
  return Object.fromEntries(HEAT_KEYS.map((k) => [k, Array.from({ length: 24 }, () => 0)]));
}

function ensureHeatmap(doc) {
  if (!doc.heatmap) doc.heatmap = {};
  for (const k of HEAT_KEYS) {
    if (!Array.isArray(doc.heatmap[k]) || doc.heatmap[k].length !== 24) {
      doc.heatmap[k] = Array.from({ length: 24 }, () => 0);
    }
  }
}

function todayUtc() {
  return DateTime.now().setZone("UTC").toFormat("yyyy-MM-dd");
}

function todayHourUtc() {
  return DateTime.now().setZone("UTC").hour;
}

/**
 * One-time / idempotent backfill for legacy docs missing heatmap (avoids sparse $inc).
 */
async function migrateLegacyAnalytics() {
  try {
    const def = defaultHeatmap();
    const res = await Analytics.updateMany(
      { $or: [{ heatmap: { $exists: false } }, { heatmap: null }] },
      { $set: { heatmap: def } }
    );
    if (res.modifiedCount > 0) {
      console.log(`[Analytics] Backfilled heatmap on ${res.modifiedCount} document(s).`);
    }
  } catch (err) {
    console.error("[Analytics] Legacy migration:", err.message);
  }
}

async function upsertInc(dateStr, inc, extraSetOnInsert = {}) {
  // Do not put `heatmap` in $setOnInsert when $inc touches heatmap.* — MongoDB rejects
  // "Updating the path 'heatmap' would create a conflict at 'heatmap'".
  const base = { date: dateStr, ...extraSetOnInsert };
  await Analytics.findOneAndUpdate(
    { date: dateStr },
    {
      $setOnInsert: base,
      $inc: inc
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
}

async function recordHeatmap(kind) {
  if (!HEAT_KEYS.includes(kind)) return;
  try {
    const date = todayUtc();
    const hour = todayHourUtc();
    await upsertInc(date, { [`heatmap.${kind}.${hour}`]: 1 });
  } catch (err) {
    console.error("Heatmap Error:", err.message);
  }
}

async function recordAbStat(key) {
  if (!key || typeof key !== "string" || key.length > 120) return;
  const safe = key.replace(/[.$]/g, "_").slice(0, 120);
  try {
    const date = todayUtc();
    await upsertInc(date, { [`abStats.${safe}`]: 1 });
  } catch (err) {
    console.error("AB stat Error:", err.message);
  }
}

async function registerPageView(page, userAgent = "") {
  try {
    const date = todayUtc();
    const hour = todayHourUtc();
    const ua = String(userAgent).toLowerCase();
    const inc = {};

    if (page === "home") {
      inc.homepageViews = 1;
      inc[`heatmap.page_home.${hour}`] = 1;
    }
    if (page === "chat") {
      inc.chatPageViews = 1;
      inc[`heatmap.page_chat.${hour}`] = 1;
    }
    if (/iphone|android|ipad|mobile/.test(ua)) {
      inc["devices.mobile"] = 1;
    } else {
      inc["devices.desktop"] = 1;
    }

    await upsertInc(date, inc);
  } catch (err) {
    console.error("Analytics Error:", err.message);
  }
}

async function trackEvent(field, value = 1) {
  if (!TRACKABLE_NUM_FIELDS.has(field)) return;
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return;
  try {
    const date = todayUtc();
    await upsertInc(date, { [field]: n });
  } catch (err) {
    console.error("Event Tracking Error:", err.message);
  }
}

async function getTodayDocLean() {
  const date = todayUtc();
  let doc = await Analytics.findOne({ date }).lean();
  if (!doc) {
    await Analytics.findOneAndUpdate(
      { date },
      { $setOnInsert: { date, heatmap: defaultHeatmap() } },
      { upsert: true, setDefaultsOnInsert: true, returnDocument: "after" }
    );
    doc = await Analytics.findOne({ date }).lean();
  }
  ensureHeatmap(doc);
  if (!doc.devices) doc.devices = { mobile: 0, desktop: 0 };
  return doc;
}

async function analyticsSnapshot(activeUsersCount) {
  try {
    const doc = await getTodayDocLean();
    const avgChatSeconds = doc.completedChats
      ? Math.round(doc.totalChatDurationMs / doc.completedChats / 1000)
      : 0;

    const matchRate = doc.chatStarts
      ? Number(((doc.matches / doc.chatStarts) * 100).toFixed(1))
      : 0;

    const skipRate = doc.matches
      ? Number(((doc.skips / doc.matches) * 100).toFixed(1))
      : 0;

    return {
      date: doc.date,
      homepageViews: doc.homepageViews,
      chatPageViews: doc.chatPageViews,
      activeUsers: activeUsersCount,
      chatStarts: doc.chatStarts,
      matches: doc.matches,
      matchRate,
      skips: doc.skips,
      skipRate,
      reports: doc.reports,
      messagesSent: doc.messagesSent,
      imagesSent: doc.imagesSent,
      averageChatSeconds: avgChatSeconds,
      devices: doc.devices,
      heatmap: doc.heatmap,
      abStats: doc.abStats || {}
    };
  } catch (err) {
    return { error: "Snapshot Failed" };
  }
}

async function exportAnalyticsRange(days = 14) {
  const start = DateTime.now().setZone("UTC").minus({ days }).toFormat("yyyy-MM-dd");
  const rows = await Analytics.find({ date: { $gte: start } }).sort({ date: 1 }).lean();
  return rows;
}

module.exports = {
  registerPageView,
  trackEvent,
  analyticsSnapshot,
  recordHeatmap,
  recordAbStat,
  exportAnalyticsRange,
  migrateLegacyAnalytics,
  HEAT_KEYS
};
