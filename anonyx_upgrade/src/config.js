const isProduction = process.env.NODE_ENV === "production";

const mongodb = process.env.MONGODB_URI || process.env.MONGO_URI || "";

module.exports = {
  isProduction,

  port: Number(process.env.PORT) || 3000,
  domain: process.env.DOMAIN || "localhost",

  // Never fall back to localhost on Render/production
  mongodb,

  /** Trust X-Forwarded-* from this many hops */
  trustProxy:
    process.env.TRUST_PROXY !== undefined
      ? Number(process.env.TRUST_PROXY)
      : 1,

  /** Secure session cookies on HTTPS */
  sessionCookieSecure:
    process.env.SESSION_COOKIE_SECURE === "true" ||
    (isProduction && process.env.SESSION_COOKIE_INSECURE !== "true"),

  /** In production this must be provided from environment */
  sessionSecret:
    process.env.SESSION_SECRET ||
    (isProduction ? "" : "dev-only-session-secret-change-in-env"),

  maxHttpBufferSize: 1e7,
  maxTabsPerUser: 3,

  message: {
    maxLength: 300,
    minIntervalMs: 500,
    similarityThreshold: 0.85
  },

  reconnect: {
    gracePeriodMs: 15000
  },

  image: {
    maxPayloadLength: 7000000,
    maxSizeBytes: 5 * 1024 * 1024,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    expiresInMs: 10000
  },

  typing: {
    cooldownMs: 900
  },

  rematch: {
    skipMemoryMs: 30 * 60 * 1000,
    searchDelayMs: 350
  },

  rateLimits: {
    startPerMinute: 12,
    messagesPerMinute: 50,
    imagesPerMinute: 10,
    reportsPerMinute: 5
  },

  experiments: {
    hero_cta: {
      variants: ["control", "emphasis"],
      weights: [50, 50]
    },
    chat_header: {
      variants: ["default", "minimal"],
      weights: [60, 40]
    }
  },

  groupChat: {
    maxMembers: 8,
    maxRooms: 400,
    inviteLocked: process.env.GROUP_INVITE_LOCKED !== "false"
  }
};