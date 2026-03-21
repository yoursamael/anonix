function removeFromWaiting(waiting, socketId) {
  const index = waiting.findIndex((socket) => socket.id === socketId);
  if (index !== -1) waiting.splice(index, 1);
}

function compatible(a, b) {
  const aLikesB = a.preference === "both" || a.preference === b.gender;
  const bLikesA = b.preference === "both" || b.preference === a.gender;
  return aLikesB && bLikesA;
}

function sanitizeText(value, maxLength = 300) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function roomKey(socketA, socketB) {
  return [socketA.id, socketB.id].sort().join(":");
}

function rememberSkip(recentSkips, userA, userB, ttlMs) {
  const keyA = `${userA}:${userB}`;
  const keyB = `${userB}:${userA}`;
  const expiresAt = Date.now() + ttlMs;
  recentSkips.set(keyA, expiresAt);
  recentSkips.set(keyB, expiresAt);
}

function hasRecentSkip(recentSkips, userA, userB) {
  const key = `${userA}:${userB}`;
  const expiresAt = recentSkips.get(key);
  if (!expiresAt) return false;
  if (expiresAt < Date.now()) {
    recentSkips.delete(key);
    return false;
  }
  return true;
}

function cleanExpiredSkips(recentSkips) {
  const now = Date.now();
  for (const [key, expiresAt] of recentSkips.entries()) {
    if (expiresAt < now) recentSkips.delete(key);
  }
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

module.exports = {
  removeFromWaiting,
  compatible,
  sanitizeText,
  roomKey,
  rememberSkip,
  hasRecentSkip,
  cleanExpiredSkips,
  getClientIp
};
