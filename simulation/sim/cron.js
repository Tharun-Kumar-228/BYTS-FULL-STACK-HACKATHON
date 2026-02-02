const cron = require('node-cron');
const User = require('../models/User');
const { generateSensorData, calculateAndStoreHistory, trimOldRecords } = require('../utils/dataGenerator');

// Run one full simulation cycle for a single user
const runSimulationForUser = async (userId, ticks = 5) => {
  await generateSensorData(userId, ticks);
  await calculateAndStoreHistory(userId);
  await trimOldRecords(userId);
};

// Run simulation for all users (used by cron and manual trigger)
const simulationLoop = async (ticks = 5) => {
  console.log('🔄 Simulation tick:', new Date().toISOString());
  const users = await User.find({ simulation_enabled: true }, '_id').lean();
  if (!users.length) {
    console.warn('⚠️ No eligible users found (simulation_enabled=false), skipping run');
    return { ran: false, users: [], reason: 'no_enabled_users' };
  }

  const results = [];

  for (const { _id } of users) {
   try {
      await runSimulationForUser(_id, ticks);
      results.push({ userId: _id.toString(), status: 'ok' });
    } catch (error) {
      console.error(`❌ Simulation error for user ${_id}:`, error.message);
      results.push({ userId: _id.toString(), status: 'error', message: error.message });
    }
  }

  console.log(`✅ Full simulation cycle complete for ${results.length} user(s)`);
  return { ran: true, users: results };
};

// Every 2 minutes (agent polls every 30s, this is fine)
cron.schedule('*/2 * * * *', () => simulationLoop().catch(err => {
  console.error('❌ Scheduled simulation error:', err.message);
}));

console.log('🚀 Simulation loop scheduled (every 2 minutes; per-user enable)');
module.exports = { simulationLoop, runSimulationForUser };
