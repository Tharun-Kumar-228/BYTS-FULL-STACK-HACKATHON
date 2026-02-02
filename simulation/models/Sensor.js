const mongoose = require('mongoose');

const sensorSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  id: { type: String, required: true },
  type: { type: String, enum: ['temperature', 'motion', 'power_total'], required: true },
  room: String,
  value: mongoose.Schema.Types.Mixed,
  unit: { type: String, enum: ['C', 'kW', 'bool'] },
  last_motion_ts: Date
}, { timestamps: true });

// Compound index to ensure id is unique per user
sensorSchema.index({ userId: 1, id: 1 }, { unique: true });

module.exports = mongoose.model('Sensor', sensorSchema);
