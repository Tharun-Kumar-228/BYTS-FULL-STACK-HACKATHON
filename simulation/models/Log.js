const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  timestamp: { type: Date, default: Date.now, index: true },
  source: { type: String, enum: ['agent', 'user', 'system'] },
  device_id: String,
  action: String,
  details: mongoose.Schema.Types.Mixed,
  reason: String
});

// Index for efficient queries by user and timestamp
logSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('Log', logSchema);
