const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  interests: [String],
  reputation: { type: Number, default: 0 },
  lastActive: { type: Date, default: Date.now },
  isBanned: { type: Boolean, default: false },
  preferences: {
    gender: String,
    interestedIn: String,
    language: String
  }
}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);
