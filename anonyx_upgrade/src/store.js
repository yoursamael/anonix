const { createAnalytics } = require("./analytics");

function createStore() {
  return {
    waiting: [],
    users: new Map(),
    messageLimit: new Map(),
    typingLimit: new Map(),
    roomStartTimes: new Map(),
    recentSkips: new Map(),
    reports: [],
    bannedUsers: new Set(),
    analytics: createAnalytics()
  };
}

module.exports = {
  createStore
};