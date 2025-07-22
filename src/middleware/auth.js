const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');
const { cache } = require('../config/redis');

// Protect routes - require authentication
const protect = async (req, res, next) => {
  try {
    let token;

    // Get token from header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Make sure token exists
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized to access this route'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Check if token is blacklisted (cached in Redis)
      const isBlacklisted = await cache.exists(`blacklist_${token}`);
      if (isBlacklisted) {
        return res.status(401).json({
          success: false,
          error: 'Token has been invalidated'
        });
      }

      // Try to get user from cache first
      let user = await cache.get(`user_${decoded.id}`);
      
      if (!user) {
        // If not in cache, get from database
        user = await User.findById(decoded.id).select('-password');
        if (!user) {
          return res.status(401).json({
            success: false,
            error: 'No user found with this token'
          });
        }
        
        // Cache user for 15 minutes
        await cache.set(`user_${decoded.id}`, user, 900);
      }

      // Check if user is active
      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          error: 'User account has been deactivated'
        });
      }

      req.user = user;
      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized to access this route'
      });
    }
  } catch (error) {
    logger.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error during authentication'
    });
  }
};

// Grant access to specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized to access this route'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `User role ${req.user.role} is not authorized to access this route`
      });
    }
    next();
  };
};

// Optional authentication - doesn't fail if no token
const optionalAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Check if token is blacklisted
        const isBlacklisted = await cache.exists(`blacklist_${token}`);
        if (!isBlacklisted) {
          let user = await cache.get(`user_${decoded.id}`);
          
          if (!user) {
            user = await User.findById(decoded.id).select('-password');
            if (user && user.isActive) {
              await cache.set(`user_${decoded.id}`, user, 900);
            }
          }
          
          if (user && user.isActive) {
            req.user = user;
          }
        }
      } catch (error) {
        // Token invalid, but continue without user
        logger.debug('Optional auth token invalid:', error.message);
      }
    }

    next();
  } catch (error) {
    logger.error('Optional auth middleware error:', error);
    next();
  }
};

// Check if user owns resource or is admin
const ownerOrAdmin = (resourceUserField = 'user') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Not authorized to access this route'
      });
    }

    // Admin can access everything
    if (req.user.role === 'admin') {
      return next();
    }

    // Check if user owns the resource
    const resource = req.resource || req.body;
    if (resource && resource[resourceUserField] && resource[resourceUserField].toString() === req.user._id.toString()) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'Not authorized to access this resource'
    });
  };
};

module.exports = {
  protect,
  authorize,
  optionalAuth,
  ownerOrAdmin
};
