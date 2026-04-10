const mongoose = require('mongoose');

const cloudAccountSchema = new mongoose.Schema({
  name: { type: String, required: true },           // display name e.g. "Account #1"
  cloudName: { type: String, required: true },
  apiKey: { type: String, required: true },
  apiSecret: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  priority: { type: Number, default: 0 },           // lower = higher priority
  usageBytes: { type: Number, default: 0 },         // tracked usage in bytes
  limitBytes: { type: Number, default: 26843545600 }, // default 25 GB
  totalUploads: { type: Number, default: 0 },
  lastUsed: { type: Date },
  notes: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

// Check if over limit
cloudAccountSchema.virtual('isOverLimit').get(function () {
  return this.usageBytes >= this.limitBytes * 0.9; // 90% threshold
});

// Usage percentage
cloudAccountSchema.virtual('usagePercent').get(function () {
  return Math.round((this.usageBytes / this.limitBytes) * 100);
});

cloudAccountSchema.set('toJSON', { virtuals: true });
cloudAccountSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('CloudAccount', cloudAccountSchema);
