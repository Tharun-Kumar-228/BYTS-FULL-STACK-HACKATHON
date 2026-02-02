require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const Device = require('../models/Device');
const Sensor = require('../models/Sensor');
const History = require('../models/History');
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const path = require('path');
// ✅ FIXED: Make main function ASYNC
const seed = async () => {
  try {
    await connectDB();
    console.log('🌱 Seeding data...');

    // Clear existing data
    await Device.deleteMany({});
    await Sensor.deleteMany({});
    await History.deleteMany({});

    // Seed devices
    await Device.insertMany([
      { id: 'light_living', type: 'light', room: 'Living Room', metadata: { is_critical: false, auto_off_timeout: 20, rated_power_kw: 0.06 }, state: { on: true, brightness: 70 } },
      { id: 'light_bedroom', type: 'light', room: 'Bedroom', metadata: { is_critical: false, auto_off_timeout: 15, rated_power_kw: 0.04 }, state: { on: false } },
      { id: 'ac_bedroom', type: 'ac', room: 'Bedroom', metadata: { rated_power_kw: 1.5 }, state: { on: true, mode: 'cool', temp_setpoint: 24 } },
      { id: 'plug_kitchen', type: 'plug', room: 'Kitchen', metadata: { is_critical: true, rated_power_kw: 0.8 }, state: { on: true } }
    ]);

    // Seed sensors
    await Sensor.insertMany([
      { id: 'sensor_power_total', type: 'power_total', room: 'House', value: 2.36, unit: 'kW' },
      { id: 'sensor_temp_bedroom', type: 'temperature', room: 'Bedroom', value: 28.5, unit: 'C' },
      { id: 'sensor_temp_living', type: 'temperature', room: 'Living Room', value: 30.2, unit: 'C' },
      { id: 'sensor_motion_living', type: 'motion', room: 'Living Room', value: false, unit: 'bool' },
      { id: 'sensor_motion_bedroom', type: 'motion', room: 'Bedroom', value: false, unit: 'bool' }
    ]);

    // ✅ FIXED: History with timestamp_iso
    const historyData = [];
    const now = new Date();
    for (let i = 19; i >= 0; i--) {
      historyData.push({
        timestamp_iso: new Date(now.getTime() - i * 30 * 1000).toISOString(),
        power_total_kw: 1.2 + (Math.random() - 0.5) * 0.8,
        avg_temp_c: 28.5 + (Math.random() - 0.5) * 2,
        mode: 'normal'
      });
    }
    await History.insertMany(historyData);

    console.log('✅ SEED COMPLETE!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seed failed:', error.message);
    process.exit(1);
  }
};

// ✅ FIXED: Call async function
seed();
