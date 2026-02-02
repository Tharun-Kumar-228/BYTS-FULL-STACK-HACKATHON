const mongoose = require('mongoose');

const sensorDataSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Device' },
  id: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['power_total', 'temperature', 'motion', 'humidity'], 
    required: true 
  },
  room: { type: String, required: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  unit: { type: String, enum: ['kW', 'C', 'bool', '%'], required: true },
  timestamp_iso: { type: Date, required: true }
}, { timestamps: true });

// Index for efficient queries by user and timestamp
sensorDataSchema.index({ userId: 1, timestamp_iso: -1 });
sensorDataSchema.index({ userId: 1, type: 1, timestamp_iso: -1 });

module.exports = mongoose.model('SensorData', sensorDataSchema);
