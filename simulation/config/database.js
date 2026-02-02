const mongoose = require('mongoose');

// Fail fast if Mongo is unreachable to avoid hanging requests
mongoose.set('bufferCommands', false);

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 5
    });
    console.log('✅ MongoDB Connected - smart-home-sim');
  } catch (error) {
    console.error('❌ MongoDB Error:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
