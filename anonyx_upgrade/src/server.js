require("dotenv").config();

const express = require("express");
const rateLimit = require("express-rate-limit");
const http = require("http");
const path = require("path");
const helmet = require("helmet");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { Server } = require("socket.io");

const config = require("./config");
const { createStore } = require("./store");
const { registerPageView, analyticsSnapshot } = require("./analytics");
const {
  removeFromWaiting,
  compatible,
  sanitizeText,
  roomKey,
  rememberSkip,
  hasRecentSkip,
  cleanExpiredSkips,
  getClientIp
} = require("./utils");

const app = express();
const store = createStore();

app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "change_me_now",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 12
    }
  })
);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'", "'unsafe-inline'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:", "https:"],
        "connect-src": ["'self'", "ws:", "wss:"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
        "form-action": ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

app.use((req, res, next) => {
  const host = req.headers.host || "";
  if (host === `www.${config.domain}`) {
    return res.redirect(301, `https://${config.domain}${req.originalUrl}`);
  }
  next();
});

app.use(express.static(path.join(__dirname, "../public")));

function requireAdmin(req, res, next) {
  if (!req.session.admin) {
    return res.status(401).json({ ok: false, message: "Unauthorized" });
  }
  next();
}

function requireAdminPage(req, res, next) {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }
  next();
}

function render(page) {
  return (req, res) => {
    registerPageView(store.analytics, page, req.headers["user-agent"] || "");
    res.sendFile(
      path.join(__dirname, "../public", page === "home" ? "index.html" : "chat.html")
    );
  };
}

app.get("/", render("home"));
app.get("/chat", render("chat"));

app.get("/privacy-policy", (req, res) =>
  res.sendFile(path.join(__dirname, "../public", "privacy-policy.html"))
);

app.get("/terms", (req, res) =>
  res.sendFile(path.join(__dirname, "../public", "terms.html"))
);

app.get("/404", (req, res) =>
  res.status(404).sendFile(path.join(__dirname, "../public", "404.html"))
);

app.get("/api/stats", (req, res) => {
  res.json(analyticsSnapshot(store.analytics, store.users.size));
});

app.post("/api/report", (req, res) => {
  const reason = sanitizeText(req.body?.reason || "", 120);
  const reportedUser = sanitizeText(req.body?.reportedUser || "unknown", 64);

  if (!reason) {
    return res.status(400).json({ ok: false, message: "Reason is required" });
  }

  store.analytics.reports += 1;
  store.reports.push({
    reason,
    reportedUser,
    ip: getClientIp(req),
    at: new Date().toISOString()
  });

  res.json({ ok: true });
});

// ---------------- ADMIN AUTH ----------------

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 5, // only 5 attempts per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    message: "Too many login attempts. Try again later."
  }
});

app.get("/admin/login", (req, res) => {
  if (req.session.admin) {
    return res.redirect("/admin");
  }
  res.sendFile(path.join(__dirname, "../public", "admin-login.html"));
});

app.post("/admin/login", adminLoginLimiter, async (req, res) => {
  const username = sanitizeText(req.body?.username || "", 100);
  const password = String(req.body?.password || "");

  const validUser = username === (process.env.ADMIN_USERNAME || "admin");
  const validPass = await bcrypt.compare(
    password,
    process.env.ADMIN_PASSWORD_HASH || ""
  );

if (!validUser || !validPass) {
  await new Promise((resolve) => setTimeout(resolve, 100000));
  return res.status(401).json({
    ok: false,
    message: "Invalid username or password"
  });
}
  req.session.admin = {
    username,
    loginAt: new Date().toISOString()
  };

  res.json({
    ok: true,
    message: "Login successful"
  });
});

app.post("/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true, message: "Logged out" });
  });
});

// ---------------- ADMIN ROUTES ----------------

app.get("/admin", requireAdminPage, (req, res) => {
  res.sendFile(path.join(__dirname, "../public", "admin.html"));
});

app.get("/admin/me", requireAdmin, (req, res) => {
  res.json({
    ok: true,
    admin: req.session.admin
  });
});

app.get("/admin/users", requireAdmin, (req, res) => {
  res.json([...store.users.keys()]);
});

app.get("/admin/reports", requireAdmin, (req, res) => {
  res.json(store.reports);
});

app.get("/admin/banned", requireAdmin, (req, res) => {
  res.json([...store.bannedUsers]);
});

const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: config.maxHttpBufferSize,
  cors: {
    origin: true,
    methods: ["GET", "POST"]
  }
});

app.post("/admin/ban", requireAdmin, (req, res) => {
  const { userId } = req.body || {};
  if (!userId) {
    return res.status(400).json({ ok: false, message: "Missing userId" });
  }

  store.bannedUsers.add(userId);

  const sockets = store.users.get(userId);
  if (sockets) {
    sockets.forEach((id) => {
      const s = io.sockets.sockets.get(id);
      if (s) {
        s.emit("system", "You have been banned.");
        s.disconnect(true);
      }
    });
  }

  return res.json({
    ok: true,
    message: "User banned",
    userId
  });
});

app.post("/admin/unban", requireAdmin, (req, res) => {
  const { userId } = req.body || {};
  if (!userId) {
    return res.status(400).json({ ok: false, message: "Missing userId" });
  }

  if (!store.bannedUsers.has(userId)) {
    return res.json({
      ok: false,
      message: "User is not banned"
    });
  }

  store.bannedUsers.delete(userId);

  return res.json({
    ok: true,
    message: "User unbanned",
    userId
  });
});

app.post("/admin/kick", requireAdmin, (req, res) => {
  const { userId } = req.body || {};
  if (!userId) {
    return res.status(400).json({ ok: false, message: "Missing userId" });
  }

  const sockets = store.users.get(userId);
  if (sockets) {
    sockets.forEach((id) => {
      const s = io.sockets.sockets.get(id);
      if (s) {
        s.emit("system", "You have been kicked.");
        s.disconnect(true);
      }
    });
  }

  return res.json({
    ok: true,
    message: "User kicked",
    userId
  });
});

function emitOnlineCount() {
  io.emit("online", store.users.size);
}

function getUserSocketSet(userId) {
  if (!store.users.has(userId)) {
    store.users.set(userId, new Set());
  }
  return store.users.get(userId);
}

function rateLimitCheck(socket, key, maxPerMinute) {
  if (!socket.rateCounters) socket.rateCounters = {};

  const now = Date.now();
  const bucket = socket.rateCounters[key] || {
    count: 0,
    resetAt: now + 60000
  };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + 60000;
  }

  bucket.count += 1;
  socket.rateCounters[key] = bucket;

  return bucket.count <= maxPerMinute;
}

function matchUser(socket) {
  if (!socket || !socket.connected || !socket.gender || !socket.preference || socket.room) {
    return;
  }

  cleanExpiredSkips(store.recentSkips);
  removeFromWaiting(store.waiting, socket.id);

  const partnerIndex = store.waiting.findIndex((candidate) => {
    if (!candidate.connected || candidate.id === socket.id) return false;
    if (!compatible(socket, candidate)) return false;
    if (hasRecentSkip(store.recentSkips, socket.userId, candidate.userId)) return false;
    return true;
  });

  if (partnerIndex === -1) {
    store.waiting.push(socket);
    socket.emit("searching", "Waiting for a compatible stranger...");
    return;
  }

  const partner = store.waiting.splice(partnerIndex, 1)[0];
  if (!partner || !partner.connected) {
    matchUser(socket);
    return;
  }

  const room = `room-${socket.id}-${partner.id}`;
  socket.join(room);
  partner.join(room);

  socket.room = room;
  partner.room = room;

  socket.partner = partner.id;
  partner.partner = socket.id;

  socket.partnerUserId = partner.userId;
  partner.partnerUserId = socket.userId;

  const startedAt = Date.now();
  store.roomStartTimes.set(roomKey(socket, partner), startedAt);
  store.analytics.matches += 1;

  socket.emit("matched", { room, partnerLabel: "Stranger" });
  partner.emit("matched", { room, partnerLabel: "Stranger" });
  io.to(room).emit("system", " Say hi ..💞");
}

function closeRoom(socket, systemMessageForPartner) {
  const partner = socket.partner ? io.sockets.sockets.get(socket.partner) : null;
  const currentRoom = socket.room;

  if (currentRoom && socket.partner) {
    const key = roomKey(socket, { id: socket.partner });
    const startedAt = store.roomStartTimes.get(key);

    if (startedAt) {
      store.analytics.totalChatDurationMs += Date.now() - startedAt;
      store.analytics.completedChats += 1;
      store.roomStartTimes.delete(key);
    }
  }

  if (socket.room) socket.leave(socket.room);
  socket.room = null;
  socket.partner = null;
  socket.partnerUserId = null;

  if (partner && partner.room === currentRoom) {
    partner.leave(currentRoom);
    partner.room = null;
    partner.partner = null;
    partner.partnerUserId = null;

    if (systemMessageForPartner) {
      partner.emit("system", systemMessageForPartner);
    }

    return partner;
  }

  return null;
}

function rematchSocket(socket, notice) {
  if (!socket || !socket.connected) return;

  removeFromWaiting(store.waiting, socket.id);
  if (notice) socket.emit("system", notice);

  setTimeout(() => {
    if (socket.connected && socket.gender && socket.preference && !socket.room) {
      matchUser(socket);
    }
  }, config.rematch.searchDelayMs);
}

io.on("connection", (socket) => {
  const userId = sanitizeText(String(socket.handshake.query.userId || ""), 64);

  if (!userId) {
    socket.emit("system", "Invalid session");
    socket.disconnect(true);
    return;
  }

  if (store.bannedUsers.has(userId)) {
    socket.emit("system", "You are banned.");
    socket.disconnect(true);
    return;
  }

  socket.userId = userId;
  store.analytics.uniqueUsers.add(userId);

  const userSockets = getUserSocketSet(userId);
  userSockets.add(socket.id);

  if (userSockets.size > config.maxTabsPerUser) {
    socket.emit("tabLimitExceeded", `Maximum ${config.maxTabsPerUser} tabs allowed`);
    userSockets.delete(socket.id);

    if (userSockets.size === 0) {
      store.users.delete(userId);
    }

    socket.disconnect(true);
    emitOnlineCount();
    return;
  }

  emitOnlineCount();

  socket.on("start", ({ gender, preference, interests, language }) => {
    if (!rateLimitCheck(socket, "start", config.rateLimits.startPerMinute)) return;

    const allowedGender = ["male", "female"];
    const allowedPreference = ["male", "female", "both"];

    if (!allowedGender.includes(gender) || !allowedPreference.includes(preference)) return;

    socket.gender = gender;
    socket.preference = preference;
    socket.interests = Array.isArray(interests) ? interests.slice(0, 5) : [];
    socket.language = sanitizeText(language || "English", 30);

    store.analytics.chatStarts += 1;
    matchUser(socket);
  });

  socket.on("message", ({ msg, replyTo }) => {
    if (!socket.room) return;

    if (!rateLimitCheck(socket, "message", config.rateLimits.messagesPerMinute)) {
      socket.emit("system", "Slow down a bit.");
      return;
    }

    const cleanMsg = sanitizeText(msg, config.message.maxLength);
    const cleanReply = sanitizeText(replyTo || "", 80) || null;

    if (!cleanMsg) return;

    if (!socket.lastMessages) socket.lastMessages = [];

    const repeatCount = socket.lastMessages.filter((m) => m === cleanMsg).length;
    if (repeatCount >= 3) {
      socket.emit("system", "Stop spamming.");
      return;
    }

    socket.lastMessages.push(cleanMsg);
    if (socket.lastMessages.length > 5) socket.lastMessages.shift();

    const now = Date.now();
    const last = store.messageLimit.get(socket.id) || 0;

    if (now - last < config.message.minIntervalMs) return;
    store.messageLimit.set(socket.id, now);

    store.analytics.messagesSent += 1;

    socket.emit("messageAck", { ok: true, id: now });
    socket.to(socket.room).emit("message", {
      msg: cleanMsg,
      replyTo: cleanReply,
      senderLabel: "Stranger"
    });
  });

  socket.on("image", ({ img, replyTo, imageId, expiresIn }) => {
    if (!socket.room || !img) return;

    if (!rateLimitCheck(socket, "image", config.rateLimits.imagesPerMinute)) {
      socket.emit("system", "Too many images. Try again later.");
      return;
    }

    if (typeof img !== "string" || img.length > config.image.maxPayloadLength) return;

    if (!socket.lastImages) socket.lastImages = [];
    if (socket.lastImages.includes(img)) {
      socket.emit("system", "Duplicate image blocked.");
      return;
    }
    socket.lastImages.push(img);
    if (socket.lastImages.length > 3) socket.lastImages.shift();

    const cleanReply = sanitizeText(replyTo || "", 80) || null;
    store.analytics.imagesSent += 1;

    socket.to(socket.room).emit("image", {
      img,
      replyTo: cleanReply,
      imageId: sanitizeText(imageId || "", 64) || null,
      expiresIn: Number(expiresIn) || config.image.expiresInMs
    });
  });

  socket.on("typing", () => {
    if (!socket.room) return;

    const now = Date.now();
    const last = store.typingLimit.get(socket.id) || 0;

    if (now - last < config.typing.cooldownMs) return;

    store.typingLimit.set(socket.id, now);
    socket.to(socket.room).emit("typing");
  });

  socket.on("report", ({ reason }) => {
    if (!rateLimitCheck(socket, "report", config.rateLimits.reportsPerMinute)) return;

    const cleanReason = sanitizeText(reason || "", 120);
    if (!cleanReason) return;

    store.analytics.reports += 1;
    store.reports.push({
      reporter: socket.userId,
      against: socket.partnerUserId || "unknown",
      reason: cleanReason,
      at: new Date().toISOString()
    });

    socket.emit("reportSubmitted");
  });

  socket.on("skip", () => {
    if (!socket.lastSkipAt) socket.lastSkipAt = 0;
    if (Date.now() - socket.lastSkipAt < 2000) {
      socket.emit("system", "Wait before skipping again.");
      return;
    }
    socket.lastSkipAt = Date.now();

    if (socket.userId && socket.partnerUserId) {
      rememberSkip(
        store.recentSkips,
        socket.userId,
        socket.partnerUserId,
        config.rematch.skipMemoryMs
      );
      rememberSkip(
        store.recentSkips,
        socket.partnerUserId,
        socket.userId,
        config.rematch.skipMemoryMs
      );
    }

    store.analytics.skips += 1;

    const closedPartner = closeRoom(socket, "Stranger skipped");

    socket.emit("clearChat");
    socket.emit("system", "Searching for new stranger...");

    if (closedPartner) {
      closedPartner.emit("clearChat");
      setTimeout(() => rematchSocket(closedPartner), 300);
    }

    setTimeout(() => rematchSocket(socket), 300);
  });

  socket.on("disconnect", () => {
    removeFromWaiting(store.waiting, socket.id);

    const partner = closeRoom(socket, "Stranger disconnected");
    if (partner) rematchSocket(partner, "Searching for a new stranger...");

    if (store.users.has(socket.userId)) {
      const sockets = store.users.get(socket.userId);
      sockets.delete(socket.id);

      if (sockets.size === 0) {
        store.users.delete(socket.userId);
      }
    }

    store.messageLimit.delete(socket.id);
    store.typingLimit.delete(socket.id);
    emitOnlineCount();
  });
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "../public", "404.html"));
});

server.listen(config.port, () => {
  console.log(`Anonyx server running on port ${config.port}`);
});