const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({

  id: { type: String, required: true },
  type: { type: String, enum: ['light', 'ac', 'plug'], required: true },
  room: { type: String, required: true },
  metadata: {
    is_critical: { type: Boolean, default: false },
    auto_off_timeout: { type: Number, default: 20 },
    rated_power_kw: { type: Number, required: true }
  },
  state: {
    on: { type: Boolean, default: false },
    brightness: { type: Number, min: 0, max: 100 },
    mode: { type: String, enum: ['cool', 'heat', 'fan'] },
    temp_setpoint: { type: Number, min: 16, max: 35 }
  }
}, { timestamps: true });

// Compound index to ensure id is unique per user
deviceSchema.index({ userId: 1, id: 1 }, { unique: true });

module.exports = mongoose.model('Device', deviceSchema);
