const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  timestamp_iso: { type: String, required: true },  // ← String (ISO), not Date
  power_total_kw: { type: Number, required: true },
  avg_temp_c: { type: Number, default: 25 },
  mode: { type: String, default: 'normal' }
}, { timestamps: true });  // ← timestamps: true, not timestamp_iso

// Index for efficient queries by user and timestamp
historySchema.index({ userId: 1, timestamp_iso: -1 });

module.exports = mongoose.model('History', historySchema);
