module.exports = {
  port: Number(process.env.PORT) || 3000,
  domain: "anonyx.online",
  maxHttpBufferSize: 1e6,
  maxTabsPerUser: 3,
  message: {
    maxLength: 300,
    minIntervalMs: 500
  },
  image: {
    maxPayloadLength: 500000,
    maxSizeBytes: 700 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    expiresInMs: 5000
  },
  typing: {
    cooldownMs: 900
  },
  rematch: {
    skipMemoryMs: 10 * 60 * 1000,
    searchDelayMs: 350
  },
  rateLimits: {
    startPerMinute: 10,
    messagesPerMinute: 45,
    imagesPerMinute: 8,
    reportsPerMinute: 5
  }
};
