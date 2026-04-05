const mongoose = require("mongoose");

const ReportSchema = new mongoose.Schema({
  reporterId: { type: String, required: true },
  reportedId: { type: String, required: true },
  reason: { type: String, required: true },
  roomId: { type: String },
  status: { type: String, enum: ["pending", "resolved", "dismissed"], default: "pending" },
  timestamp: { type: Date, default: Date.now }
});

const BanSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  reason: { type: String, default: "User banned" },
  expiresAt: { type: Date },
  timestamp: { type: Date, default: Date.now }
});

const IpBanSchema = new mongoose.Schema({
  ip: { type: String, required: true, index: true },
  reason: { type: String, default: "Prohibited activity" },
  expiresAt: { type: Date },
  timestamp: { type: Date, default: Date.now }
});

module.exports = {
  Report: mongoose.model("Report", ReportSchema),
  Ban: mongoose.model("Ban", BanSchema),
  IpBan: mongoose.model("IpBan", IpBanSchema)
};
