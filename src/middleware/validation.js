const { body, param, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

// Common validation rules
const commonValidations = {
  // MongoDB ObjectId validation
  mongoId: (field = 'id') => param(field).isMongoId().withMessage(`Invalid ${field} format`),
  
  // Pagination validation
  pagination: [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],

  // Search validation
  search: query('search').optional().isLength({ min: 1, max: 100 }).withMessage('Search term must be 1-100 characters'),

  // Date validation
  dateRange: [
    query('startDate').optional().isISO8601().withMessage('Invalid start date format'),
    query('endDate').optional().isISO8601().withMessage('Invalid end date format')
  ],

  // User validation
  username: body('username')
    .isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Username can only contain letters, numbers, and underscores'),
  
  email: body('email')
    .isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  
  password: body('password')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),

  // Tournament validation
  tournamentTitle: body('title')
    .notEmpty().withMessage('Title is required')
    .isLength({ max: 100 }).withMessage('Title cannot exceed 100 characters')
    .trim(),
  
  tournamentDescription: body('description')
    .notEmpty().withMessage('Description is required')
    .isLength({ max: 1000 }).withMessage('Description cannot exceed 1000 characters')
    .trim(),

  gameType: body('gameType')
    .isIn(['Free Fire', 'PUBG Mobile', 'Call of Duty Mobile', 'Valorant Mobile'])
    .withMessage('Invalid game type'),

  tournamentType: body('tournamentType')
    .isIn(['1v1', '2v2', '4v4', 'Squad', 'Battle Royale', 'Custom'])
    .withMessage('Invalid tournament type'),

  // Payment validation
  amount: body('amount')
    .isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  
  currency: body('currency')
    .optional()
    .isIn(['INR', 'USD', 'EUR']).withMessage('Invalid currency'),

  // Match validation
  matchStatus: body('status')
    .optional()
    .isIn(['scheduled', 'ready', 'ongoing', 'paused', 'completed', 'cancelled', 'disputed'])
    .withMessage('Invalid match status'),

  // File upload validation
  fileSize: (maxSize = 5 * 1024 * 1024) => (req, res, next) => {
    if (req.file && req.file.size > maxSize) {
      return res.status(400).json({
        success: false,
        error: `File size cannot exceed ${Math.round(maxSize / (1024 * 1024))}MB`
      });
    }
    next();
  },

  fileType: (allowedTypes = ['image/jpeg', 'image/png', 'image/gif']) => (req, res, next) => {
    if (req.file && !allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        error: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`
      });
    }
    next();
  }
};

// Rate limiting configurations
const rateLimiters = {
  // Strict rate limiting for authentication endpoints
  auth: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: {
      success: false,
      error: 'Too many authentication attempts, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn(`Rate limit exceeded for auth: ${req.ip}`);
      res.status(429).json({
        success: false,
        error: 'Too many authentication attempts, please try again later.'
      });
    }
  }),

  // Moderate rate limiting for API endpoints
  api: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: {
      success: false,
      error: 'Too many requests, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn(`Rate limit exceeded for API: ${req.ip} - ${req.originalUrl}`);
      res.status(429).json({
        success: false,
        error: 'Too many requests, please try again later.'
      });
    }
  }),

  // Strict rate limiting for payment endpoints
  payment: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 payment attempts per hour
    message: {
      success: false,
      error: 'Too many payment attempts, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn(`Rate limit exceeded for payments: ${req.ip}`);
      res.status(429).json({
        success: false,
        error: 'Too many payment attempts, please try again later.'
      });
    }
  }),

  // Rate limiting for file uploads
  upload: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 uploads per hour
    message: {
      success: false,
      error: 'Too many file uploads, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false
  })
};

// Validation error handler middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.param,
      message: error.msg,
      value: error.value
    }));

    logger.warn('Validation errors:', {
      url: req.originalUrl,
      method: req.method,
      errors: errorMessages,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errorMessages
    });
  }
  
  next();
};

// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
  // Recursively sanitize object properties
  const sanitizeObject = (obj) => {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        // Remove potentially dangerous characters
        sanitized[key] = value
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
          .replace(/javascript:/gi, '') // Remove javascript: protocol
          .replace(/on\w+\s*=/gi, '') // Remove event handlers
          .trim();
      } else {
        sanitized[key] = sanitizeObject(value);
      }
    }
    return sanitized;
  };

  // Sanitize request body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }

  next();
};

// Request logging middleware
const logRequest = (req, res, next) => {
  const start = Date.now();
  
  // Generate unique request ID
  req.requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Log request
  logger.info(`${req.method} ${req.originalUrl}`, {
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length')
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : 'info';
    
    logger[logLevel](`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`, {
      requestId: req.requestId,
      statusCode: res.statusCode,
      duration,
      contentLength: res.get('Content-Length')
    });
  });

  next();
};

// Security headers middleware
const securityHeaders = (req, res, next) => {
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  // Remove server information
  res.removeHeader('X-Powered-By');
  
  next();
};

// IP whitelist middleware (for admin endpoints)
const ipWhitelist = (allowedIPs = []) => {
  return (req, res, next) => {
    if (allowedIPs.length === 0) {
      return next(); // No restrictions if no IPs specified
    }

    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (!allowedIPs.includes(clientIP)) {
      logger.warn(`Access denied for IP: ${clientIP} to ${req.originalUrl}`);
      return res.status(403).json({
        success: false,
        error: 'Access denied from this IP address'
      });
    }
    
    next();
  };
};

// Device fingerprinting middleware
const deviceFingerprint = (req, res, next) => {
  const userAgent = req.get('User-Agent') || '';
  const acceptLanguage = req.get('Accept-Language') || '';
  const acceptEncoding = req.get('Accept-Encoding') || '';
  
  // Create a simple device fingerprint
  req.deviceFingerprint = Buffer.from(
    `${userAgent}|${acceptLanguage}|${acceptEncoding}|${req.ip}`
  ).toString('base64');
  
  next();
};

module.exports = {
  commonValidations,
  rateLimiters,
  handleValidationErrors,
  sanitizeInput,
  logRequest,
  securityHeaders,
  ipWhitelist,
  deviceFingerprint
};
