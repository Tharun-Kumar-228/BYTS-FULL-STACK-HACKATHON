const SensorData = require('../models/SensorData');
const History = require('../models/History');
const Device = require('../models/Device');

const generateSensorData = async (userId, count = 10) => {
  const now = new Date();
  const sensorData = [];

  // Generate realistic sensor readings around your sample values
  for (let i = 0; i < count; i++) {
    const timestamp = new Date(now.getTime() - i * 2 * 60 * 1000); // 2min intervals

    sensorData.push(...[
      // Power total (around 1.15kW like your sample)
      {
        userId,
        id: 'sensor_power_total',
        type: 'power_total',
        room: 'House',
        value: 1.15 + (Math.random() - 0.5) * 0.3,  // ~0.85-1.45kW
        unit: 'kW',
        timestamp_iso: timestamp
      },
      // Temperatures (around 28°C)
      {
        userId,
        id: 'sensor_temp_living',
        type: 'temperature',
        room: 'Living Room',
        value: 28.0 + (Math.random() - 0.5) * 2.5,  // 26.5-29.5°C
        unit: 'C',
        timestamp_iso: timestamp
      },
      {
        userId,
        id: 'sensor_temp_bedroom',
        type: 'temperature',
        room: 'Bedroom',
        value: 27.8 + (Math.random() - 0.5) * 2.0,  // 26.8-28.8°C
        unit: 'C',
        timestamp_iso: timestamp
      },
      // Motion (random boolean)
      {
        userId,
        id: 'sensor_motion_living',
        type: 'motion',
        room: 'Living Room',
        value: Math.random() > 0.7,
        unit: 'bool',
        timestamp_iso: timestamp
      },
      {
        userId,
        id: 'sensor_motion_bedroom',
        type: 'motion',
        room: 'Bedroom',
        value: Math.random() > 0.85,
        unit: 'bool',
        timestamp_iso: timestamp
      }
    ]);
  }

  await SensorData.insertMany(sensorData);
  console.log(`📊 Inserted ${sensorData.length} sensor readings for user ${userId}`);
};

const calculateAndStoreHistory = async (userId) => {
  // 1. Get user's devices (for power calculation)
  const devices = await Device.find({ userId });
  
  // 2. Get latest sensor data (last 5min)
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const recentSensors = await SensorData.find({
    userId,
    timestamp_iso: { $gte: fiveMinAgo }
  }).sort({ timestamp_iso: -1 });

  if (recentSensors.length === 0) return;

  // 3. Calculate power_total_kw from DEVICES (not sensors!)
  let power_total_kw = 0;
  devices.forEach(device => {
    if (device.state.on) {
      let factor = 1.0;
      if (device.type === 'light' && device.state.brightness) {
        factor = device.state.brightness / 100;
      }
      power_total_kw += device.metadata.rated_power_kw * factor;
    }
  });

  // 4. Calculate avg_temp_c from temperature sensors
  const temps = recentSensors
    .filter(s => s.type === 'temperature')
    .map(s => s.value);
  const avg_temp_c = temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : 28.0;

  // 5. Store history record
  const historyRecord = {
    userId,
    timestamp_iso: new Date().toISOString(),
    power_total_kw: Number(power_total_kw.toFixed(3)),  // ~1.154 like your sample
    avg_temp_c: Number(avg_temp_c.toFixed(3)),         // ~28.055 like your sample
    mode: 'normal'
  };

  await History.create(historyRecord);
  console.log(`📈 History calculated: power=${historyRecord.power_total_kw}, temp=${historyRecord.avg_temp_c}`);
};

const trimOldRecords = async (userId) => {
  // Trim histories: keep latest 1500, delete first 500 when exceeds
  const historyCount = await History.countDocuments({ userId });
  if (historyCount > 1500) {
    const cutoff = await History.find({ userId })
      .sort({ timestamp_iso: -1 })
      .skip(1500)
      .limit(500)
      .select('_id')
      .lean();
    
    await History.deleteMany({ _id: { $in: cutoff.map(h => h._id) } });
    console.log(`🗑️ Trimmed ${cutoff.length} old history records`);
  }

  // Trim sensor_data: keep latest 3000, delete first 1000 when exceeds
  const sensorCount = await SensorData.countDocuments({ userId });
  if (sensorCount > 3000) {
    const cutoff = await SensorData.find({ userId })
      .sort({ timestamp_iso: -1 })
      .skip(3000)
      .limit(1000)
      .select('_id')
      .lean();
    
    await SensorData.deleteMany({ _id: { $in: cutoff.map(s => s._id) } });
    console.log(`🗑️ Trimmed ${cutoff.length} old sensor records`);
  }
};

module.exports = { 
  generateSensorData, 
  calculateAndStoreHistory, 
  trimOldRecords 
};
