const mongoose = require("mongoose");

const heatmapBucket = {
  type: [Number],
  default: () => Array.from({ length: 24 }, () => 0)
};

const AnalyticsSchema = new mongoose.Schema({
  date: { type: String, unique: true, index: true }, // Format: YYYY-MM-DD
  homepageViews: { type: Number, default: 0 },
  chatPageViews: { type: Number, default: 0 },
  chatStarts: { type: Number, default: 0 },
  matches: { type: Number, default: 0 },
  skips: { type: Number, default: 0 },
  reports: { type: Number, default: 0 },
  messagesSent: { type: Number, default: 0 },
  imagesSent: { type: Number, default: 0 },
  totalChatDurationMs: { type: Number, default: 0 },
  completedChats: { type: Number, default: 0 },
  uniqueUsers: { type: Number, default: 0 },
  devices: {
    mobile: { type: Number, default: 0 },
    desktop: { type: Number, default: 0 }
  },
  heatmap: {
    page_home: heatmapBucket,
    page_chat: heatmapBucket,
    action_chat_start: heatmapBucket,
    action_message: heatmapBucket,
    action_skip: heatmapBucket,
    action_group_join: heatmapBucket,
    cta_click: heatmapBucket
  },
  abStats: { type: mongoose.Schema.Types.Mixed, default: () => ({}) }
}, { timestamps: true });

module.exports = mongoose.model("Analytics", AnalyticsSchema);
