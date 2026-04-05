function removeFromWaiting(waiting, socketId) {
  const index = waiting.findIndex((socket) => socket.id === socketId);
  if (index !== -1) waiting.splice(index, 1);
}

/**
 * Advanced Compatibility Check
 * Returns a score from 0 to 10. Higher is better.
 * Matches gender, language, and interests.
 */
function getMatchScore(a, b) {
  const aLikesB = a.preference === "both" || a.preference === b.gender;
  const bLikesA = b.preference === "both" || b.preference === a.gender;

  if (!aLikesB || !bLikesA) return 0;

  let score = 1; // Base score for gender compatibility

  // Language Matching (Bonus +3)
  if (a.language === b.language || a.language === "Both" || b.language === "Both") {
    score += 3;
  }

  // Interest Matching (Bonus +2 per match, max 6)
  if (a.interests && b.interests) {
    const common = a.interests.filter((i) => b.interests.includes(i));
    score += Math.min(common.length * 2, 6);
  }

  return score;
}

function sanitizeText(value, maxLength = 300) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function roomKey(socketA, socketB) {
  const ids = [socketA.userId, socketB.userId].sort();
  return ids.join(":");
}

function rememberSkip(recentSkips, userA, userB, ttlMs) {
  const key = [userA, userB].sort().join(":");
  recentSkips.set(key, Date.now() + ttlMs);
}

function hasRecentSkip(recentSkips, userA, userB) {
  const key = [userA, userB].sort().join(":");
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

function getClientIp(obj) {
  // Check if it's a socket or request
  const req = obj.handshake ? obj.request : obj;
  const forwarded = req.headers ? req.headers["x-forwarded-for"] : null;
  
  if (typeof forwarded === "string" && forwarded) {
    return forwarded.split(",")[0].trim();
  }
  
  // Fallback for socket.io specifically
  if (obj.handshake && obj.handshake.address) {
    return obj.handshake.address;
  }

  return (req.socket ? req.socket.remoteAddress : "unknown") || "unknown";
}

/**
 * Simple similarity check (Levenshtein based or common word count)
 * For spam prevention.
 */
function getSimilarity(s1, s2) {
  if (!s1 || !s2) return 0;
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 1.0;

  const costs = [];
  for (let i = 0; i <= longer.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= shorter.length; j++) {
      if (i === 0) costs[j] = j;
      else {
        if (j > 0) {
          let newValue = costs[j - 1];
          if (longer.charAt(i - 1) !== shorter.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
    }
    if (i > 0) costs[shorter.length] = lastValue;
  }
  const diff = costs[shorter.length];
  return (longer.length - diff) / longer.length;
}

module.exports = {
  removeFromWaiting,
  getMatchScore,
  sanitizeText,
  roomKey,
  rememberSkip,
  hasRecentSkip,
  cleanExpiredSkips,
  getClientIp,
  getSimilarity
};
