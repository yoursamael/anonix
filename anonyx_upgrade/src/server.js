require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const dns = require("node:dns");

if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder("ipv4first");
}

const express = require("express");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const { MongoStore } = require("connect-mongo");
const http = require("http");
const path = require("path");
const crypto = require("node:crypto");
const helmet = require("helmet");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const QRCode = require("qrcode");
const { Server } = require("socket.io");

const config = require("./config");
const { createStore, noteMessageThroughput, messagesPerMinute } = require("./store");
const {
  registerPageView,
  trackEvent,
  analyticsSnapshot,
  recordHeatmap,
  recordAbStat,
  exportAnalyticsRange,
  migrateLegacyAnalytics
} = require("./analytics");
const { assignVariants } = require("./ab");
const User = require("./models/User");
const { Report, Ban, IpBan } = require("./models/Moderation");
const {
  removeFromWaiting,
  getMatchScore,
  sanitizeText,
  rememberSkip,
  hasRecentSkip,
  cleanExpiredSkips,
  getClientIp
} = require("./utils");

const app = express();
const store = createStore();

const dbOptions = {
  family: 4,
  serverSelectionTimeoutMS: 15000
};

function assertRuntimeEnv() {
  if (config.isProduction) {
    if (!process.env.SESSION_SECRET || String(process.env.SESSION_SECRET).length < 24) {
      console.error("FATAL: Set SESSION_SECRET in the environment (minimum 24 chars) for production.");
      process.exit(1);
    }

    if (!process.env.ADMIN_PASSWORD_HASH) {
      console.warn("WARN: ADMIN_PASSWORD_HASH is not set — admin login will reject all passwords until configured.");
    }

    if (!config.mongodb) {
      console.error("FATAL: Missing MongoDB connection string. Set MONGODB_URI in Render.");
      process.exit(1);
    }

    if (
      typeof config.mongodb === "string" &&
      (config.mongodb.includes("localhost") || config.mongodb.includes("127.0.0.1"))
    ) {
      console.error("FATAL: Production MongoDB URI cannot point to localhost.");
      process.exit(1);
    }

    console.log(
      "[Anonyx] NODE_ENV=production — secure cookies:",
      config.sessionCookieSecure,
      " trust proxy:",
      config.trustProxy
    );
  } else {
    console.log("[Anonyx] development mode — set NODE_ENV=production for live deployments.");
  }

  console.log("MONGODB_URI exists:", !!process.env.MONGODB_URI);
  console.log("MONGO_URI exists:", !!process.env.MONGO_URI);
  console.log("Mongo config exists:", !!config.mongodb);
}
async function connectDatabase() {
  console.log("Connecting to Database...");

  try {
    if (!config.mongodb) {
      throw new Error("MongoDB URI is empty");
    }

    const maskedUri = config.mongodb.replace(/\/\/([^:]+):([^@]+)@/, "//$1:****@");
    console.log("Mongo URI preview:", maskedUri);

    await mongoose.connect(config.mongodb, dbOptions);
    console.log("✅ Successfully connected to MongoDB Atlas");
  } catch (err) {
    console.error("❌ MongoDB Connection Error:");
    console.error("message:", err.message);
    console.error("name:", err.name);
    if (err.code) console.error("code:", err.code);
    if (err.reason) console.error("reason:", err.reason);
    console.error(err);
    process.exit(1);
  }
}

async function bootstrap() {
  assertRuntimeEnv();
  await connectDatabase();
  await migrateLegacyAnalytics();

  // --- MIDDLEWARE SETUP ---
  app.set("trust proxy", config.trustProxy);

  const sessionCookie = {
    httpOnly: true,
    secure: config.sessionCookieSecure,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24
  };

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  const sessionMiddleware = session({
    name: "anonyx.sid",
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: config.mongodb,
      mongoOptions: dbOptions,
      dbName: "anonyx"
    }),
    cookie: sessionCookie
  });

  app.use(sessionMiddleware);

  const helmetBase = {
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
        "img-src": ["'self'", "data:", "https:"],
        "connect-src": ["'self'", "ws:", "wss:"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false
  };

  if (config.isProduction) {
    helmetBase.hsts = { maxAge: 31536000, includeSubDomains: true, preload: false };
  }

  app.use(helmet(helmetBase));

  const apiLimiter = rateLimit({
    windowMs: 60_000,
    max: config.isProduction ? 200 : 2000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: "Too many requests" }
  });

  const beaconLimiter = rateLimit({
    windowMs: 60_000,
    max: config.isProduction ? 90 : 2000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: "Too many beacons" }
  });

  const experimentsLimiter = rateLimit({
    windowMs: 60_000,
    max: config.isProduction ? 120 : 2000,
    standardHeaders: true,
    legacyHeaders: false
  });

  const adminLoginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    max: config.isProduction ? 25 : 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, message: "Too many login attempts" },
    skipSuccessfulRequests: true
  });

  const qrLimiter = rateLimit({
    windowMs: 60_000,
    max: 45,
    standardHeaders: true,
    legacyHeaders: false
  });

  app.use(express.static(path.join(__dirname, "../public")));

  app.get("/api/qr.svg", qrLimiter, (req, res) => {
    const raw = String(req.query.d || "");
    const text = sanitizeText(raw, 512);

    if (!text || text.length < 4) {
      return res.status(400).type("text/plain").send("Bad request");
    }

    QRCode.toString(
      text,
      { type: "svg", margin: 1, width: 200, errorCorrectionLevel: "M" },
      (err, svg) => {
        if (err) return res.status(500).type("text/plain").send("QR failed");
        res.type("image/svg+xml");
        res.set("Cache-Control", "private, max-age=120");
        res.send(svg);
      }
    );
  });

  // --- PUBLIC ROUTES ---
  app.get("/", (req, res) => {
    registerPageView("home", req.headers["user-agent"] || "");
    res.sendFile(path.join(__dirname, "../public", "index.html"));
  });

  app.get("/chat", (req, res) => {
    registerPageView("chat", req.headers["user-agent"] || "");
    res.sendFile(path.join(__dirname, "../public", "chat.html"));
  });

  app.get("/api/experiments", experimentsLimiter, (req, res) => {
    const userId = sanitizeText(String(req.query.userId || ""), 128) || "anon";
    res.json({
      variants: assignVariants(userId, config.experiments || {}),
      experiments: Object.keys(config.experiments || {})
    });
  });

  app.post("/api/beacon", beaconLimiter, (req, res) => {
    const kind = sanitizeText(String((req.body && req.body.kind) || ""), 64);
    if (!kind) return res.status(400).json({ ok: false });
    if (!/^[a-zA-Z0-9_.:-]+$/.test(kind)) return res.status(400).json({ ok: false });

    const heatKinds = new Set([
      "page_home",
      "page_chat",
      "action_chat_start",
      "action_message",
      "action_skip",
      "action_group_join",
      "cta_click"
    ]);

    if (heatKinds.has(kind)) {
      recordHeatmap(kind).catch(() => {});
    } else if (kind.startsWith("ab_")) {
      recordAbStat(kind).catch(() => {});
    }

    res.json({ ok: true });
  });

  app.use("/api", apiLimiter);

  // --- ADMINISTRATIVE AUTH MIDDLEWARE ---
  function adminAuth(req, res, next) {
    if (!req.session || !req.session.admin) {
      const accept = req.headers.accept || "";
      if (req.xhr || accept.includes("json")) {
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }
      return res.redirect("/admin/login");
    }
    next();
  }

  // --- ADMIN ROUTES (SERVER-SIDE REDIRECTS) ---
  app.get("/admin", (req, res) => {
    if (!req.session || !req.session.admin) {
      return res.redirect("/admin/login");
    }
    res.sendFile(path.join(__dirname, "../public", "admin.html"));
  });

  app.get("/admin/login", (req, res) => {
    if (req.session && req.session.admin) {
      return res.redirect("/admin");
    }
    res.sendFile(path.join(__dirname, "../public", "admin-login.html"));
  });

  app.post("/admin/login", adminLoginLimiter, async (req, res) => {
    try {
      const { username, password } = req.body;
      const validUser = username === (process.env.ADMIN_USERNAME || "admin");
      const validPass = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH || "");

      if (!validUser || !validPass) {
        return res.status(401).json({ ok: false, message: "Invalid credentials" });
      }

      req.session.admin = { username, loggedAt: new Date() };
      req.session.save((err) => {
        if (err) return res.status(500).json({ ok: false });
        res.json({ ok: true });
      });
    } catch (err) {
      res.status(500).json({ ok: false });
    }
  });

  app.post("/admin/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("anonyx.sid", {
        path: "/",
        httpOnly: true,
        secure: config.sessionCookieSecure,
        sameSite: "lax"
      });
      res.json({ ok: true });
    });
  });

  app.get("/admin/me", (req, res) => {
    if (!req.session || !req.session.admin) {
      return res.status(401).json({ ok: false });
    }
    res.json({ ok: true, admin: req.session.admin });
  });

  // --- DATA FETCHING (AUTH PROTECTED) ---
  app.get("/api/stats", adminAuth, async (req, res) => {
    try {
      const stats = await analyticsSnapshot(store.users.size);
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: "Stats failed" });
    }
  });

  app.get("/admin/reports", adminAuth, async (req, res) => {
    const reps = await Report.find().sort("-timestamp").limit(50);
    res.json(reps);
  });

  app.get("/admin/banned", adminAuth, async (req, res) => {
    try {
      const [bans, ipBans] = await Promise.all([
        Ban.find().sort("-timestamp"),
        IpBan.find().sort("-timestamp")
      ]);

      const combined = [
        ...bans.map((b) => ({ ...b.toObject(), type: "Account", target: b.userId })),
        ...ipBans.map((i) => ({ ...i.toObject(), type: "Network", target: i.ip }))
      ].sort((a, b) => b.timestamp - a.timestamp);

      res.json(combined);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch restrictions" });
    }
  });

  function csvEscape(v) {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  app.get("/admin/export/analytics", adminAuth, async (req, res) => {
    try {
      const fmt = String(req.query.format || "json").toLowerCase();
      const rows = await exportAnalyticsRange(Number(req.query.days) || 21);

      if (fmt === "csv") {
        const headers = [
          "date",
          "homepageViews",
          "chatPageViews",
          "chatStarts",
          "matches",
          "skips",
          "reports",
          "messagesSent",
          "imagesSent"
        ];
        const lines = [headers.join(",")];

        for (const r of rows) {
          lines.push(headers.map((h) => csvEscape(r[h])).join(","));
        }

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="anonyx-analytics.csv"');
        return res.send(lines.join("\n"));
      }

      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: "Export failed" });
    }
  });

  app.get("/admin/export/reports", adminAuth, async (req, res) => {
    try {
      const fmt = String(req.query.format || "json").toLowerCase();
      const reps = await Report.find().sort("-timestamp").limit(500).lean();

      if (fmt === "csv") {
        const headers = ["timestamp", "reporterId", "reportedId", "reason", "roomId"];
        const lines = [headers.join(",")];

        for (const r of reps) {
          lines.push(headers.map((h) => csvEscape(r[h])).join(","));
        }

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="anonyx-reports.csv"');
        return res.send(lines.join("\n"));
      }

      res.json(reps);
    } catch (err) {
      res.status(500).json({ error: "Export failed" });
    }
  });

  app.get("/admin/export/bans", adminAuth, async (req, res) => {
    try {
      const fmt = String(req.query.format || "json").toLowerCase();
      const [bans, ipBans] = await Promise.all([Ban.find().lean(), IpBan.find().lean()]);

      const combined = [
        ...bans.map((b) => ({ ...b, type: "Account", target: b.userId })),
        ...ipBans.map((i) => ({ ...i, type: "Network", target: i.ip }))
      ];

      if (fmt === "csv") {
        const headers = ["type", "target", "reason", "timestamp"];
        const lines = [headers.join(",")];

        for (const b of combined) {
          lines.push([b.type, b.target, b.reason, b.timestamp].map((x) => csvEscape(x)).join(","));
        }

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="anonyx-bans.csv"');
        return res.send(lines.join("\n"));
      }

      res.json(combined);
    } catch (err) {
      res.status(500).json({ error: "Export failed" });
    }
  });

  const server = http.createServer(app);

  const io = new Server(server, {
    maxHttpBufferSize: config.maxHttpBufferSize || 1e7,
    cors: { origin: true, methods: ["GET", "POST"], credentials: true }
  });

  const wrapSession = (middleware) => (socket, next) => middleware(socket.request, {}, next);
  io.use(wrapSession(sessionMiddleware));

  setInterval(() => {
    io.to("__admin__").emit("admin:metrics", {
      onlineUsers: store.users.size,
      waitingInQueue: store.waiting.length,
      activeDmRooms: store.activeRooms.size,
      activeGroupRooms: store.groupRooms.size,
      messagesPerMinute: messagesPerMinute(store),
      ts: Date.now()
    });
  }, 2500);

  // --- ADMIN ACTIONS (AUTH PROTECTED, AFTER IO) ---
  app.post("/admin/ban", adminAuth, async (req, res) => {
    const { userId, reason } = req.body;
    if (!userId) return res.status(400).json({ ok: false });

    await Ban.create({ userId, reason });

    const sockets = store.users.get(userId);
    if (sockets) {
      sockets.forEach((id) => {
        const s = io.sockets.sockets.get(id);
        if (s) {
          s.emit("system", "⛔ You have been permanently banned.");
          s.disconnect(true);
        }
      });
    }

    res.json({ ok: true });
  });

  app.delete("/admin/unban/:id", adminAuth, async (req, res) => {
    const target = req.params.id;
    console.info(`[Admin] Granting Pardon for: ${target}`);

    await Promise.allSettled([
      Ban.deleteMany({ userId: target }),
      IpBan.deleteMany({ ip: target })
    ]);

    res.json({ ok: true, msg: "Administrative pardon granted." });
  });

  app.delete("/admin/report/:id", adminAuth, async (req, res) => {
    await Report.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  });

  app.post("/admin/resolve-all", adminAuth, async (req, res) => {
    await Report.deleteMany({});
    res.json({ ok: true });
  });

  app.post("/admin/announce", adminAuth, (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ ok: false });
    io.emit("system", `📢 ALERT: ${message}`);
    res.json({ ok: true });
  });

  app.get("/admin/rooms", adminAuth, (req, res) => {
    const dm = Array.from(store.activeRooms.entries()).map(([id, data]) => ({
      id,
      type: "dm",
      users: data.users || [],
      startedAt: data.startedAt
    }));

    const groups = Array.from(store.groupRooms.entries()).map(([id, meta]) => {
      const users = [];
      for (const sid of meta.sockets) {
        const s = io.sockets.sockets.get(sid);
        if (s && s.userId) users.push(s.userId);
      }

      return {
        id,
        type: "group",
        users: [...new Set(users)],
        startedAt: meta.createdAt
      };
    });

    res.json([...groups, ...dm]);
  });

  app.post("/admin/close-room/:roomId", adminAuth, async (req, res) => {
    const roomId = req.params.roomId;
    console.log(`[Admin] Termination request for room: ${roomId}`);

    if (String(roomId).startsWith("grp-")) {
      const roomSockets = io.sockets.adapter.rooms.get(roomId);

      if (roomSockets) {
        io.to(roomId).emit("system", "This group room was closed by an administrator.");
        io.to(roomId).emit("group:shutdown");

        for (const sid of roomSockets) {
          const s = io.sockets.sockets.get(sid);
          if (s) {
            s.groupRoomId = null;
            s.leave(roomId);
          }
        }
      }

      store.groupRooms.delete(roomId);
      return res.json({ ok: true });
    }

    const roomSockets = io.sockets.adapter.rooms.get(roomId);

    if (roomSockets) {
      io.to(roomId).emit("system", "Session terminated by admin.");

      const sids = Array.from(roomSockets);
      sids.forEach((sid) => {
        const s = io.sockets.sockets.get(sid);
        if (s) {
          s.room = null;
          s.partnerId = null;
          s.leave(roomId);

          console.log(`[Admin] Re-queuing ${s.userId} from terminated room.`);
          setTimeout(() => matchUser(s), 500);
        }
      });
    }

    store.activeRooms.delete(roomId);
    res.json({ ok: true });
  });

  app.post("/admin/ip-ban", adminAuth, async (req, res) => {
    const { ip, reason } = req.body;
    await IpBan.create({ ip, reason });

    const allSockets = await io.fetchSockets();
    allSockets.forEach((s) => {
      if (getClientIp(s) === ip) {
        s.emit("system", "⛔ IP Banned.");
        s.disconnect(true);
      }
    });

    res.json({ ok: true });
  });

  // --- CORE MATCHING & SOCKET LOGIC ---
  function removeSocketFromGroupRoom(socket) {
    const gid = socket.groupRoomId;
    if (!gid) return;

    const g = store.groupRooms.get(gid);
    socket.leave(gid);
    socket.groupRoomId = null;

    if (g) {
      g.sockets.delete(socket.id);

      if (g.sockets.size === 0) {
        store.groupRooms.delete(gid);
      } else {
        io.to(gid).emit("group:roster", { roomId: gid, memberCount: g.sockets.size });
      }
    }
  }

  function leavePrivateMatchForGroup(socket) {
    if (!socket.room || String(socket.room).startsWith("grp-")) return;

    const roomId = socket.room;
    const partnerId = socket.partnerId;

    socket.leave(roomId);
    socket.room = null;
    socket.partnerId = null;
    store.activeRooms.delete(roomId);

    const partnerSockets = partnerId ? store.users.get(partnerId) : null;
    if (partnerSockets) {
      partnerSockets.forEach((sid) => {
        const p = io.sockets.sockets.get(sid);
        if (p && p.room === roomId) {
          p.leave(roomId);
          p.room = null;
          p.partnerId = null;
          p.emit("clearChat");
          p.emit("system", "Partner joined a group room.");
          setTimeout(() => matchUser(p), 450);
        }
      });
    }

    socket.emit("clearChat");
    socket.emit("system", "You joined a group room.");
  }

  async function matchUser(socket) {
    if (socket.groupRoomId) return;
    if (!socket.connected || !socket.gender || socket.room) {
      console.log(`[Matching] Socket ${socket.id} not ready (gender: ${socket.gender}, room: ${socket.room})`);
      return;
    }

    cleanExpiredSkips(store.recentSkips);
    removeFromWaiting(store.waiting, socket.id);

    let bestPartner = null;
    let bestScore = 0;
    let partnerIdx = -1;

    console.log(`[Matching] ${socket.userId} searching. Queue size: ${store.waiting.length}`);
    if (store.waiting.length === 0) console.log("[Matching] Queue empty, standby.");

    for (let i = 0; i < store.waiting.length; i++) {
      const candidate = store.waiting[i];

      if (candidate.id === socket.id || candidate.userId === socket.userId) continue;
      if (candidate.groupRoomId) continue;

      if (candidate.room) {
        console.warn(`[Matching] Clean-up: Removing matched candidate ${candidate.userId} from queue.`);
        store.waiting.splice(i, 1);
        i--;
        continue;
      }

      if (hasRecentSkip(store.recentSkips, socket.userId, candidate.userId)) {
        console.log(`[Matching] Skip: Recent skip between ${socket.userId} and ${candidate.userId}`);
        continue;
      }

      const score = getMatchScore(socket, candidate);
      if (score <= 0) {
        console.log(
          `[Matching] Incompatible: ${socket.userId} (${socket.gender}->${socket.preference}) vs ${candidate.userId} (${candidate.gender}->${candidate.preference})`
        );
        continue;
      }

      console.log(`[Matching] Potential Match: ${candidate.userId} Score: ${score}`);

      if (score > bestScore) {
        bestScore = score;
        bestPartner = candidate;
        partnerIdx = i;
      }
    }

    if (bestPartner && bestScore > 0) {
      console.log(`[Matching] MATCH SUCCESS: ${socket.userId} + ${bestPartner.userId}`);

      store.waiting.splice(partnerIdx, 1);

      const room = `room-${socket.userId}-${bestPartner.userId}`;
      socket.join(room);
      bestPartner.join(room);

      socket.room = room;
      bestPartner.room = room;
      socket.partnerId = bestPartner.userId;
      bestPartner.partnerId = socket.userId;

      store.activeRooms.set(room, {
        users: [socket.userId, bestPartner.userId],
        startedAt: Date.now()
      });

      trackEvent("matches");
      socket.emit("matched", { partnerLogo: "💞" });
      bestPartner.emit("matched", { partnerLogo: "💞" });
      io.to(room).emit("system", "Connected with a stranger!");
    } else {
      console.log(`[Matching] Entering queue: ${socket.userId}`);
      store.waiting.push(socket);
      socket.emit("searching");
    }
  }

  io.on("connection", async (socket) => {
    const ip = getClientIp(socket);
    const userId = sanitizeText(String(socket.handshake.query.userId || ""), 64);
    if (!userId) return socket.disconnect(true);

    const ipBan = await IpBan.findOne({ ip });
    if (ipBan && (!ipBan.expiresAt || ipBan.expiresAt > new Date())) {
      socket.emit("system", "⛔ Access denied from this IP.");
      return socket.disconnect(true);
    }

    const ban = await Ban.findOne({ userId });
    if (ban && (!ban.expiresAt || ban.expiresAt > new Date())) {
      socket.emit("system", "🚫 Your account is banned.");
      return socket.disconnect(true);
    }

    socket.userId = userId;

    const existingBuffer = store.reconnectBuffer.get(userId);
    if (existingBuffer) {
      clearTimeout(existingBuffer.timer);
      const roomId = existingBuffer.roomId;

      socket.join(roomId);
      socket.room = roomId;
      socket.partnerId = existingBuffer.partnerId;
      store.reconnectBuffer.delete(userId);
      socket.emit("system", "Reconnected!");
      socket.to(roomId).emit("system", "Partner reconnected.");
    }

    if (!store.users.has(userId)) {
      store.users.set(userId, new Set());
    }

    store.users.get(userId).add(socket.id);
    io.emit("online", store.users.size);

    (function emitSessionSync() {
      if (socket.groupRoomId) {
        const g = store.groupRooms.get(socket.groupRoomId);
        socket.emit("session:sync", {
          mode: "group",
          groupRoomId: socket.groupRoomId,
          inviteCode: String(socket.groupRoomId).replace(/^grp-/, ""),
          ownerUserId: g ? g.ownerUserId : null,
          inviteLocked: g ? g.inviteLocked !== false : true
        });
        return;
      }

      if (socket.room && String(socket.room).startsWith("room-")) {
        socket.emit("session:sync", { mode: "dm", active: true });
        return;
      }

      socket.emit("session:sync", { mode: "idle" });
    })();

    socket.on("admin:subscribe", () => {
      if (!socket.request.session || !socket.request.session.admin) {
        socket.emit("admin:error", { error: "Unauthorized" });
        return;
      }
      socket.join("__admin__");
      socket.emit("admin:ready", { ok: true });
    });

    socket.on("group:create", () => {
      if (!socket.userId) return;

      const maxRooms = (config.groupChat && config.groupChat.maxRooms) || 400;
      if (store.groupRooms.size >= maxRooms) {
        return socket.emit("system", "Too many active group rooms. Try again soon.");
      }

      removeFromWaiting(store.waiting, socket.id);
      leavePrivateMatchForGroup(socket);
      removeSocketFromGroupRoom(socket);

      const code = crypto.randomBytes(4).toString("hex");
      const roomId = `grp-${code}`;
      const inviteLocked = !(config.groupChat && config.groupChat.inviteLocked === false);

      store.groupRooms.set(roomId, {
        createdAt: Date.now(),
        ownerUserId: socket.userId,
        inviteLocked,
        sockets: new Set([socket.id])
      });

      socket.join(roomId);
      socket.groupRoomId = roomId;

      socket.emit("group:created", {
        roomId,
        inviteCode: code,
        ownerUserId: socket.userId,
        inviteLocked
      });

      io.to(roomId).emit("group:roster", {
        roomId,
        memberCount: 1,
        ownerUserId: socket.userId,
        inviteLocked
      });

      recordHeatmap("action_group_join").catch(() => {});
    });

    socket.on("group:join", ({ inviteCode }) => {
      const raw = sanitizeText(String(inviteCode || ""), 40);
      if (!raw) return socket.emit("system", "Enter a group code.");

      const roomId = raw.startsWith("grp-") ? raw : `grp-${raw}`;
      const g = store.groupRooms.get(roomId);
      if (!g) return socket.emit("system", "Group not found.");

      const distinctUsers = new Set();
      for (const sid of g.sockets) {
        const s = io.sockets.sockets.get(sid);
        if (s && s.userId) distinctUsers.add(s.userId);
      }

      const maxMembers = (config.groupChat && config.groupChat.maxMembers) || 8;
      if (!g.sockets.has(socket.id) && distinctUsers.size >= maxMembers) {
        return socket.emit("system", "This group is full.");
      }

      removeFromWaiting(store.waiting, socket.id);
      leavePrivateMatchForGroup(socket);
      removeSocketFromGroupRoom(socket);

      socket.join(roomId);
      socket.groupRoomId = roomId;
      g.sockets.add(socket.id);

      socket.emit("group:joined", {
        roomId,
        inviteCode: roomId.replace(/^grp-/, ""),
        ownerUserId: g.ownerUserId,
        inviteLocked: g.inviteLocked !== false,
        isOwner: socket.userId === g.ownerUserId
      });

      io.to(roomId).emit("group:roster", {
        roomId,
        memberCount: g.sockets.size,
        ownerUserId: g.ownerUserId,
        inviteLocked: g.inviteLocked !== false
      });

      recordHeatmap("action_group_join").catch(() => {});
    });

    socket.on("group:leave", () => {
      removeSocketFromGroupRoom(socket);
      socket.emit("group:left", { ok: true });
    });

    socket.on("group:message", (payload) => {
      if (!socket.groupRoomId) return;

      const roomId = socket.groupRoomId;
      const now = Date.now();

      socket.gMsgCount = (socket.gMsgCount || 0) + 1;
      if (socket.gLastMsg && now - socket.gLastMsg < 2000 && socket.gMsgCount > 10) {
        return socket.emit("system", "⚠️ Slow down in group chat.");
      }
      if (socket.gLastMsg && now - socket.gLastMsg > 2000) socket.gMsgCount = 1;
      socket.gLastMsg = now;

      if (payload && payload.img) {
        const img = payload.img;
        if (typeof img !== "string" || img.length > config.image.maxPayloadLength) {
          return socket.emit("system", "❌ Image invalid or too large.");
        }

        socket.to(roomId).emit("group:message", {
          img,
          replyTo: payload.replyTo,
          imageId: payload.imageId,
          expiresIn: payload.expiresIn || 10000,
          senderId: socket.userId
        });

        socket.emit("group:messageAck");
        noteMessageThroughput(store);
        trackEvent("imagesSent");
        return;
      }

      const msg = payload && payload.msg;
      if (!msg || typeof msg !== "string") return;

      noteMessageThroughput(store);
      recordHeatmap("action_message").catch(() => {});
      trackEvent("messagesSent");

      socket.to(roomId).emit("group:message", {
        msg,
        replyTo: (payload && payload.replyTo) || null,
        senderId: socket.userId
      });

      socket.emit("group:messageAck");
    });

    socket.on("group:typing", () => {
      if (socket.groupRoomId) {
        socket.to(socket.groupRoomId).emit("group:typing", { senderId: socket.userId });
      }
    });

    socket.on("start", (prefs) => {
      removeSocketFromGroupRoom(socket);

      socket.gender = sanitizeText(prefs.gender, 10);
      socket.preference = sanitizeText(prefs.preference, 10);
      socket.language = sanitizeText(prefs.language, 20);
      socket.interests = Array.isArray(prefs.interests) ? prefs.interests.slice(0, 5) : [];

      User.findOneAndUpdate(
        { userId },
        {
          userId,
          interests: socket.interests,
          preferences: {
            gender: socket.gender,
            interestedIn: socket.preference,
            language: socket.language
          },
          lastActive: new Date()
        },
        { upsert: true }
      ).catch((e) => console.error("User Update Error:", e));

      trackEvent("chatStarts");
      recordHeatmap("action_chat_start").catch(() => {});
      matchUser(socket);
    });

    socket.on("message", ({ msg, img, replyTo, imageId, expiresIn, msgId }) => {
      if (!socket.room) return;

      const now = Date.now();
      socket.msgCount = (socket.msgCount || 0) + 1;

      if (socket.lastMsgAt && now - socket.lastMsgAt < 2000 && socket.msgCount > 6) {
        socket.emit("system", "⚠️ Slow down! Don't spam.");
        return;
      }

      if (socket.lastMsgAt && now - socket.lastMsgAt > 2000) {
        socket.msgCount = 1;
      }

      socket.lastMsgAt = now;

      const cleanMid = sanitizeText(String(msgId || ""), 80);
      const effectiveMsgId =
        cleanMid || `m_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

      if (img) {
        if (typeof img !== "string" || img.length > config.image.maxPayloadLength) {
          return socket.emit("system", "❌ Image invalid or too large.");
        }

        socket.imgCount = (socket.imgCount || 0) + 1;
        if (socket.imgCount > config.rateLimits.imagesPerMinute) {
          return socket.emit("system", "❌ Image limit reached.");
        }

        trackEvent("imagesSent");
        noteMessageThroughput(store);

        socket.to(socket.room).emit("message", {
          img,
          replyTo,
          imageId,
          expiresIn: expiresIn || 10000,
          sender: "stranger",
          msgId: effectiveMsgId
        });

        socket.emit("messageAck", { msgId: effectiveMsgId, imageId });
        return;
      }

      trackEvent("messagesSent");
      recordHeatmap("action_message").catch(() => {});
      noteMessageThroughput(store);

      socket.to(socket.room).emit("message", {
        msg,
        replyTo,
        sender: "stranger",
        msgId: effectiveMsgId
      });

      socket.emit("messageAck", { msgId: effectiveMsgId });
    });

    socket.on("dm:deliveryAck", ({ msgId }) => {
      if (!socket.room || String(socket.room).startsWith("grp-")) return;

      const mid = sanitizeText(String(msgId || ""), 80);
      if (!mid) return;

      socket.to(socket.room).emit("dm:receipt", { msgId: mid, kind: "delivered" });
    });

    socket.on("dm:readAll", () => {
      if (!socket.room || String(socket.room).startsWith("grp-")) return;
      const now = Date.now();
      if (now - (socket._dmReadThrottle || 0) < 2800) return;
      socket._dmReadThrottle = now;
      socket.to(socket.room).emit("dm:receipt", { kind: "read_all" });
    });

    socket.on("skip", () => {
      if (!socket.room) return;

      const roomId = socket.room;
      const partnerId = socket.partnerId;

      rememberSkip(store.recentSkips, socket.userId, partnerId, config.rematch.skipMemoryMs);
      trackEvent("skips");
      recordHeatmap("action_skip").catch(() => {});

      socket.leave(roomId);
      socket.room = null;
      socket.partnerId = null;
      socket.emit("clearChat");
      socket.emit("system", "Skipped.");

      const partnerSockets = store.users.get(partnerId);
      if (partnerSockets) {
        partnerSockets.forEach((sid) => {
          const pSocket = io.sockets.sockets.get(sid);
          if (pSocket && pSocket.room === roomId) {
            pSocket.leave(roomId);
            pSocket.room = null;
            pSocket.partnerId = null;
            pSocket.emit("system", "Stranger skipped.");
            pSocket.emit("clearChat");
            setTimeout(() => matchUser(pSocket), 500);
          }
        });
      }

      matchUser(socket);
    });

    socket.on("report", async ({ reason }) => {
      if (!socket.partnerId) return;

      await Report.create({
        reporterId: socket.userId,
        reportedId: socket.partnerId,
        reason: sanitizeText(reason, 100),
        roomId: socket.room
      });

      trackEvent("reports");
      socket.emit("system", "Reported.");
    });

    socket.on("typing", () => {
      if (socket.room) socket.to(socket.room).emit("typing");
    });

    socket.on("disconnect", () => {
      removeSocketFromGroupRoom(socket);
      removeFromWaiting(store.waiting, socket.id);

      const disconnectedUserId = socket.userId;
      const userSockets = store.users.get(disconnectedUserId);

      if (userSockets) userSockets.delete(socket.id);

      if (userSockets && userSockets.size === 0) {
        store.users.delete(disconnectedUserId);

        if (socket.room) {
          const timer = setTimeout(() => {
            if (socket.room) {
              socket.to(socket.room).emit("system", "Stranger disconnected.");
            }
            store.reconnectBuffer.delete(disconnectedUserId);
          }, config.reconnect.gracePeriodMs);

          store.reconnectBuffer.set(disconnectedUserId, {
            roomId: socket.room,
            partnerId: socket.partnerId,
            timer
          });
        }
      }

      io.emit("online", store.users.size);
    });
  });

  server.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
  });
}

bootstrap();