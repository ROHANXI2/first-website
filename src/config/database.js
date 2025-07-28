const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    const mongoURI = process.env.NODE_ENV === 'test' 
      ? process.env.MONGODB_TEST_URI 
      : process.env.MONGODB_URI;

    if (!mongoURI) {
      throw new Error('MongoDB URI is not defined in environment variables');
    }

    const options = {
      maxPoolSize: 10, // Maintain up to 10 socket connections
      serverSelectionTimeoutMS: 60000, // Keep trying to send operations for 60 seconds
      socketTimeoutMS: 60000, // Close sockets after 60 seconds of inactivity
      connectTimeoutMS: 60000, // Connection timeout
      family: 4, // Use IPv4, skip trying IPv6
      bufferCommands: false, // Disable mongoose buffering
    };

    const conn = await mongoose.connect(mongoURI, options);

    logger.info(`✅ MongoDB Connected: ${conn.connection.host}`);
    logger.info(`📊 Database: ${conn.connection.name}`);

    // Connection event listeners
    mongoose.connection.on('connected', () => {
      logger.info('🔗 Mongoose connected to MongoDB');
    });

    mongoose.connection.on('error', (err) => {
      logger.error('❌ Mongoose connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('⚠️ Mongoose disconnected from MongoDB');
    });

    // Handle application termination
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      logger.info('🔌 Mongoose connection closed through app termination');
      process.exit(0);
    });

    return conn;
  } catch (error) {
    logger.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
