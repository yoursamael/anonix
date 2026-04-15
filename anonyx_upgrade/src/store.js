function createStore() {
  return {
    waiting: [],
    users: new Map(),
    activeRooms: new Map(),
    messageLimit: new Map(),
    typingLimit: new Map(),
    sessionLimit: new Map(),
    ipLimit: new Map(),
    roomStartTimes: new Map(),
    recentSkips: new Map(),
    reconnectBuffer: new Map(),
    groupRooms: new Map(),
    recentMessages: []
  };
}

function noteMessageThroughput(store) {
  const now = Date.now();
  store.recentMessages.push(now);
  const cutoff = now - 60000;
  while (store.recentMessages.length && store.recentMessages[0] < cutoff) {
    store.recentMessages.shift();
  }
}

function messagesPerMinute(store) {
  const now = Date.now();
  const cutoff = now - 60000;
  return store.recentMessages.filter((t) => t >= cutoff).length;
}

module.exports = {
  createStore,
  noteMessageThroughput,
  messagesPerMinute
};
