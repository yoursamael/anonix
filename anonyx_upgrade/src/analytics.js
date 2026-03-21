function createAnalytics() {
  return {
    homepageViews: 0,
    chatPageViews: 0,
    chatStarts: 0,
    matches: 0,
    skips: 0,
    reports: 0,
    messagesSent: 0,
    imagesSent: 0,
    totalChatDurationMs: 0,
    completedChats: 0,
    uniqueUsers: new Set(),
    devices: {
      mobile: 0,
      desktop: 0
    }
  };
}

function registerPageView(analytics, page, userAgent = "") {
  if (page === "home") analytics.homepageViews += 1;
  if (page === "chat") analytics.chatPageViews += 1;

  const ua = String(userAgent).toLowerCase();
  if (/iphone|android|ipad|mobile/.test(ua)) {
    analytics.devices.mobile += 1;
  } else {
    analytics.devices.desktop += 1;
  }
}

function analyticsSnapshot(analytics, usersSize) {
  const avgChatSeconds = analytics.completedChats
    ? Math.round(analytics.totalChatDurationMs / analytics.completedChats / 1000)
    : 0;

  const matchRate = analytics.chatStarts
    ? Number(((analytics.matches / analytics.chatStarts) * 100).toFixed(1))
    : 0;

  const skipRate = analytics.matches
    ? Number(((analytics.skips / analytics.matches) * 100).toFixed(1))
    : 0;

  return {
    homepageViews: analytics.homepageViews,
    chatPageViews: analytics.chatPageViews,
    activeUsers: usersSize,
    uniqueUsers: analytics.uniqueUsers.size,
    chatStarts: analytics.chatStarts,
    matches: analytics.matches,
    matchRate,
    skips: analytics.skips,
    skipRate,
    reports: analytics.reports,
    messagesSent: analytics.messagesSent,
    imagesSent: analytics.imagesSent,
    averageChatSeconds: avgChatSeconds,
    devices: analytics.devices
  };
}

module.exports = {
  createAnalytics,
  registerPageView,
  analyticsSnapshot
};
