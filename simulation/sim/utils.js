const History = require('../models/History');
const { generateAgentData, storeHistoryBatch } = require('../utils/dataGenerator');

const simulationLoop = async () => {
  console.log('🔄 Simulation tick:', new Date().toISOString());
  
  try {
    const freshData = generateAgentData(2); // 2 new points every 5s
    await storeHistoryBatch(freshData);
    console.log('✅ Added 2 history points');
  } catch (error) {
    console.error('❌ Simulation error:', error.message);
  }
};

module.exports = { simulationLoop };
