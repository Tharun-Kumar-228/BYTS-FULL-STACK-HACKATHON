const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const Device = require('../models/Device');
const Sensor = require('../models/Sensor');
const History = require('../models/History');
const User = require('../models/User');
const { simulationLoop, runSimulationForUser } = require('../sim/cron');

const hashPassword = (password) =>
  crypto.createHash('sha256').update(password).digest('hex');

// Seed baseline devices/sensors/history for a new user (idempotent per user)
const createDefaultAssetsForUser = async (userId) => {
  const defaultDevices = [
    { userId, id: 'light_living', type: 'light', room: 'Living Room', metadata: { is_critical: false, auto_off_timeout: 20, rated_power_kw: 0.06 }, state: { on: true, brightness: 70 } },
    { userId, id: 'light_bedroom', type: 'light', room: 'Bedroom', metadata: { is_critical: false, auto_off_timeout: 15, rated_power_kw: 0.04 }, state: { on: false } },
    { userId, id: 'ac_bedroom', type: 'ac', room: 'Bedroom', metadata: { rated_power_kw: 1.5 }, state: { on: true, mode: 'cool', temp_setpoint: 24 } },
    { userId, id: 'plug_kitchen', type: 'plug', room: 'Kitchen', metadata: { is_critical: true, rated_power_kw: 0.8 }, state: { on: true } }
  ];

  const defaultSensors = [
    { userId, id: 'sensor_power_total', type: 'power_total', room: 'House', value: 2.36, unit: 'kW' },
    { userId, id: 'sensor_temp_living', type: 'temperature', room: 'Living Room', value: 30.2, unit: 'C' },
    { userId, id: 'sensor_temp_bedroom', type: 'temperature', room: 'Bedroom', value: 28.5, unit: 'C' },
    { userId, id: 'sensor_motion_living', type: 'motion', room: 'Living Room', value: false, unit: 'bool' },
    { userId, id: 'sensor_motion_bedroom', type: 'motion', room: 'Bedroom', value: false, unit: 'bool' }
  ];

  const nowIso = new Date().toISOString();
  const defaultHistory = [{
    userId,
    timestamp_iso: nowIso,
    power_total_kw: 2.36,
    avg_temp_c: 29.0,
    mode: 'normal'
  }];

  // Upsert per user to avoid duplicate key errors from legacy indexes
  await Promise.all([
    Device.bulkWrite(defaultDevices.map((doc) => ({
      updateOne: {
        filter: { userId: doc.userId, id: doc.id },
        update: { $setOnInsert: doc },
        upsert: true
      }
    }))),
    Sensor.bulkWrite(defaultSensors.map((doc) => ({
      updateOne: {
        filter: { userId: doc.userId, id: doc.id },
        update: { $setOnInsert: doc },
        upsert: true
      }
    }))),
    History.bulkWrite(defaultHistory.map((doc) => ({
      updateOne: {
        filter: { userId: doc.userId, timestamp_iso: doc.timestamp_iso },
        update: { $setOnInsert: doc },
        upsert: true
      }
    })))
  ]);
};

// ------------ DEVICES ------------

// GET /api/sim/devices - devices for user (or all if no userId)
router.get('/sim/devices', async (req, res) => {
  try {
    const { userId } = req.query;
    const filter = userId ? { userId } : {};
    const devices = await Device.find(filter).lean();
    res.json(devices);
  } catch (err) {
    console.error('Error fetching devices:', err);
    res.status(500).json({ error: 'failed_to_fetch_devices' });
  }
});

// POST /api/sim/devices/:device_id - update device.state (agent actions)
router.post('/sim/devices/:device_id', async (req, res) => {
  const { device_id } = req.params;
  const updates = req.body;
  const userId = req.body.userId || req.query.userId;

  try {
    const filter = { id: device_id };
    if (userId) filter.userId = userId;

    const device = await Device.findOne(filter);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    // Merge into existing state
    device.state = { ...device.state.toObject(), ...updates };
    await device.save();

    console.log(`✅ ${device_id} updated:`, device.state);
    res.json({ success: true, device_id, updated_state: device.state });
  } catch (err) {
    console.error('Error updating device state:', err);
    res.status(500).json({ success: false, error: 'failed_to_update_device' });
  }
});

// ------------ SENSORS ------------

// GET /api/sim/sensors - sensors for user
router.get('/sim/sensors', async (req, res) => {
  try {
    const { userId } = req.query;
    const filter = userId ? { userId } : {};
    const sensors = await Sensor.find(filter).lean();
    res.json(sensors);
  } catch (err) {
    console.error('Error fetching sensors:', err);
    res.status(500).json({ error: 'failed_to_fetch_sensors' });
  }
});

// ------------ HISTORY ------------

// GET /api/sim/history?limit=N&userId=...
router.get('/sim/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const { userId } = req.query;
    const filter = userId ? { userId } : {};

    const rows = await History.find(filter)
      .sort({ timestamp_iso: -1 })  // newest first
      .limit(limit)
      .lean();

    res.json(rows.reverse());       // send oldest -> newest
  } catch (err) {
    console.error('Error fetching history:', err);
    res.status(500).json({ error: 'failed_to_fetch_history' });
  }
});

// ------------ USERS ------------

// POST /api/signup - create assets for a new user
router.post('/signup', async (req, res) => {
  const { userId, name, email } = req.body || {};

  if (!userId) {
    return res.status(400).json({ success: false, error: 'missing_userId' });
  }

  try {
    // The user is already created in the Python backend.
    // We just need to initialize the simulation assets for this user.
    await createDefaultAssetsForUser(userId);

    console.log(`✅ Assets created for user: ${userId} (${email || 'no-email'})`);

    res.status(201).json({
      success: true,
      message: 'Simulation assets initialized',
      userId
    });
  } catch (err) {
    console.error('Error initializing assets:', err);
    res.status(500).json({ success: false, error: 'failed_to_init_assets', message: err.message });
  }
});

// POST /api/login - basic login to enable simulation


// ------------ SIMULATION TRIGGER ------------

// POST /api/sim/run - manually trigger one simulation cycle (optionally for a single user)
router.post('/sim/run', async (req, res) => {
  const userId = req.body?.userId;
  const ticks = Number(req.body?.ticks) || 5;

  try {
    if (userId) {
      await runSimulationForUser(userId, ticks);
      return res.json({ success: true, mode: 'single', userId, ticks });
    }

    const result = await simulationLoop(ticks);
    return res.json({ success: true, mode: 'all', ticks, result });
  } catch (err) {
    console.error('Error running simulation:', err);
    res.status(500).json({ success: false, error: 'failed_to_run_simulation', message: err.message });
  }
});

// ------------ TEST / DEBUG ------------

router.get('/test', (req, res) => {
  res.json({ message: 'API routes working!' });
});

module.exports = router;
