const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const helmet = require("helmet");
const path = require("path");

const app = express();

/*
  Security headers
*/
app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

/*
  Force main domain version (optional but good for SEO)
  Redirect www.anonyx.online -> anonyx.online
*/
app.use((req, res, next) => {
  const host = req.headers.host || "";

  if (host === "www.anonyx.online") {
    return res.redirect(301, `https://anonyx.online${req.originalUrl}`);
  }

  next();
});

const server = http.createServer(app);

const io = new Server(server, {
  maxHttpBufferSize: 1e6
});

/*
  Serve static files from /public
*/
app.use(express.static(path.join(__dirname, "public")));

/*
  SEO / Site routes
  These let you use clean URLs instead of .html URLs
*/
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/chat", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "chat.html"));
});

app.get("/privacy-policy", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "privacy-policy.html"));
});

app.get("/terms", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "terms.html"));
});

/*
  Future SEO pages
  Add these only when you create the files
*/
// app.get("/anonymous-chat", (req, res) => {
//   res.sendFile(path.join(__dirname, "public", "anonymous-chat.html"));
// });

// app.get("/chat-with-strangers", (req, res) => {
//   res.sendFile(path.join(__dirname, "public", "chat-with-strangers.html"));
// });

// app.get("/random-chat-online", (req, res) => {
//   res.sendFile(path.join(__dirname, "public", "random-chat-online.html"));
// });

// app.get("/omegle-alternative", (req, res) => {
//   res.sendFile(path.join(__dirname, "public", "omegle-alternative.html"));
// });

/*
  Chat matching logic
*/
const waiting = [];
const messageLimit = new Map();
const users = new Map();
const MAX_TABS_PER_USER = 3;

function removeFromWaiting(socketId) {
  const index = waiting.findIndex((s) => s.id === socketId);
  if (index !== -1) waiting.splice(index, 1);
}

function compatible(a, b) {
  const aLikesB = a.preference === "both" || a.preference === b.gender;
  const bLikesA = b.preference === "both" || b.preference === a.gender;
  return aLikesB && bLikesA;
}

function emitOnlineCount() {
  io.emit("online", users.size);
}

function matchUser(socket) {
  if (!socket || !socket.connected) return;
  if (!socket.gender || !socket.preference) return;
  if (socket.room) return;

  removeFromWaiting(socket.id);

  const partnerIndex = waiting.findIndex((user) => {
    if (!user.connected) return false;
    if (user.id === socket.id) return false;
    return compatible(socket, user);
  });

  if (partnerIndex !== -1) {
    const partner = waiting.splice(partnerIndex, 1)[0];

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

    socket.emit("matched", room);
    partner.emit("matched", room);

    io.to(room).emit("system", "💞 You are now connected with someone special");
  } else {
    waiting.push(socket);
    socket.emit("system", "Waiting for partner...");
  }
}

function rematchSocket(socket, reasonMessage = null) {
  if (!socket || !socket.connected) return;

  if (socket.room) {
    socket.leave(socket.room);
  }

  socket.room = null;
  socket.partner = null;

  if (reasonMessage) {
    socket.emit("system", reasonMessage);
  }

  setTimeout(() => {
    if (socket.connected && socket.gender && socket.preference) {
      matchUser(socket);
    }
  }, 400);
}

io.on("connection", (socket) => {
  const userId = String(socket.handshake.query.userId || "");

  if (!userId) {
    socket.emit("system", "Invalid user session");
    socket.disconnect(true);
    return;
  }

  socket.userId = userId;

  if (!users.has(userId)) {
    users.set(userId, new Set());
  }

  users.get(userId).add(socket.id);

  if (users.get(userId).size > MAX_TABS_PER_USER) {
    socket.emit("tabLimitExceeded", `Maximum ${MAX_TABS_PER_USER} tabs allowed`);
    users.get(userId).delete(socket.id);

    if (users.get(userId).size === 0) {
      users.delete(userId);
    }

    socket.disconnect(true);
    emitOnlineCount();
    return;
  }

  emitOnlineCount();

  socket.on("start", ({ gender, preference }) => {
    socket.gender = gender;
    socket.preference = preference;
    matchUser(socket);
  });

  socket.on("message", ({ msg, replyTo }) => {
    if (!socket.room) return;
    if (!msg || !msg.trim()) return;
    if (msg.length > 300) return;

    const now = Date.now();
    const last = messageLimit.get(socket.id) || 0;

    if (now - last < 500) return;
    messageLimit.set(socket.id, now);

    socket.to(socket.room).emit("message", {
      msg: msg.trim(),
      replyTo: replyTo || null
    });
  });

  socket.on("image", ({ img, replyTo, imageId, expiresIn }) => {
    if (!socket.room) return;
    if (!img) return;
    if (img.length > 500000) return;

    socket.to(socket.room).emit("image", {
      img,
      replyTo: replyTo || null,
      imageId: imageId || null,
      expiresIn: expiresIn || 10000
    });
  });

  socket.on("typing", () => {
    if (!socket.room) return;
    socket.to(socket.room).emit("typing");
  });

  socket.on("skip", () => {
    const partner = socket.partner ? io.sockets.sockets.get(socket.partner) : null;
    const oldRoom = socket.room;

    if (socket.room) socket.leave(socket.room);
    if (partner && partner.room === oldRoom) partner.leave(oldRoom);

    socket.room = null;
    socket.partner = null;

    if (partner) {
      partner.room = null;
      partner.partner = null;
      partner.emit("system", "Stranger skipped");
    }

    socket.emit("system", "Searching for new stranger...");

    if (partner) {
      setTimeout(() => rematchSocket(partner), 300);
    }

    setTimeout(() => rematchSocket(socket), 300);
  });

  socket.on("disconnect", () => {
    removeFromWaiting(socket.id);

    const partner = socket.partner ? io.sockets.sockets.get(socket.partner) : null;
    const oldRoom = socket.room;

    if (partner && partner.room === oldRoom) {
      partner.leave(oldRoom);
      partner.room = null;
      partner.partner = null;
      partner.emit("system", "Stranger disconnected");
      setTimeout(() => rematchSocket(partner), 500);
    }

    socket.room = null;
    socket.partner = null;

    if (users.has(socket.userId)) {
      const sockets = users.get(socket.userId);
      sockets.delete(socket.id);

      if (sockets.size === 0) {
        users.delete(socket.userId);
      }
    }

    messageLimit.delete(socket.id);
    emitOnlineCount();
  });
});

/*
  404 fallback
*/
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Anonyx server running on port " + PORT);
});