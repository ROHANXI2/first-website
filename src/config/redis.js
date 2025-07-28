const redis = require('redis');
const logger = require('../utils/logger');

let redisClient = null;

const connectRedis = async () => {
  try {
    if (!process.env.REDIS_URL) {
      logger.warn('⚠️ Redis URL not provided, skipping Redis connection');
      return null;
    }

    const redisConfig = {
      url: process.env.REDIS_URL,
      retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          logger.error('❌ Redis server connection refused');
          return new Error('Redis server connection refused');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          logger.error('❌ Redis retry time exhausted');
          return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
          logger.error('❌ Redis connection attempts exceeded');
          return undefined;
        }
        // Reconnect after
        return Math.min(options.attempt * 100, 3000);
      }
    };

    if (process.env.REDIS_PASSWORD) {
      redisConfig.password = process.env.REDIS_PASSWORD;
    }

    redisClient = redis.createClient(redisConfig);

    redisClient.on('connect', () => {
      logger.info('🔗 Redis client connected');
    });

    redisClient.on('ready', () => {
      logger.info('✅ Redis client ready');
    });

    redisClient.on('error', (err) => {
      logger.error('❌ Redis client error:', err);
    });

    redisClient.on('end', () => {
      logger.warn('⚠️ Redis client connection ended');
    });

    await redisClient.connect();
    
    // Test the connection
    await redisClient.ping();
    logger.info('🏓 Redis ping successful');

    return redisClient;
  } catch (error) {
    logger.error('❌ Redis connection failed:', error.message);
    logger.warn('⚠️ Continuing without Redis (caching disabled)');
    return null;
  }
};

const getRedisClient = () => {
  return redisClient;
};

const closeRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    logger.info('🔌 Redis connection closed');
  }
};

// Cache helper functions
const cache = {
  async get(key) {
    if (!redisClient) return null;
    try {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('❌ Redis GET error:', error);
      return null;
    }
  },

  async set(key, value, expireInSeconds = 3600) {
    if (!redisClient) return false;
    try {
      await redisClient.setEx(key, expireInSeconds, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error('❌ Redis SET error:', error);
      return false;
    }
  },

  async del(key) {
    if (!redisClient) return false;
    try {
      await redisClient.del(key);
      return true;
    } catch (error) {
      logger.error('❌ Redis DEL error:', error);
      return false;
    }
  },

  async exists(key) {
    if (!redisClient) return false;
    try {
      const result = await redisClient.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('❌ Redis EXISTS error:', error);
      return false;
    }
  },

  async flushAll() {
    if (!redisClient) return false;
    try {
      await redisClient.flushAll();
      return true;
    } catch (error) {
      logger.error('❌ Redis FLUSHALL error:', error);
      return false;
    }
  }
};

module.exports = {
  connectRedis,
  getRedisClient,
  closeRedis,
  cache
};
