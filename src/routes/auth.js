const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const Tournament = require('../models/Tournament');
const { protect, authorize } = require('../middleware/auth');
const logger = require('../utils/logger');
const { cache } = require('../config/redis');

const router = express.Router();

// Rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 login attempts per windowMs
  message: {
    error: 'Too many login attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Validation rules
const registerValidation = [
  body('username')
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  body('deviceId')
    .notEmpty()
    .withMessage('Device ID is required'),
  body('freeFireId')
    .optional()
    .matches(/^[0-9]{8,12}$/)
    .withMessage('Free Fire ID must be 8-12 digits'),
  body('phoneNumber')
    .optional()
    .matches(/^\+?[1-9]\d{1,14}$/)
    .withMessage('Please provide a valid phone number')
];

const loginValidation = [
  body('login')
    .notEmpty()
    .withMessage('Username or email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  body('deviceId')
    .notEmpty()
    .withMessage('Device ID is required')
];

// Tournament registration validation rules
const tournamentRegisterValidation = [
  body('ign')
    .isLength({ min: 3, max: 20 })
    .withMessage('In-Game Name must be between 3 and 20 characters')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('In-Game Name can only contain letters, numbers, underscore, and dash'),
  body('uid')
    .matches(/^[0-9]{8,12}$/)
    .withMessage('Free Fire ID must be 8-12 digits'),
  body('countryCode')
    .notEmpty()
    .withMessage('Country code is required'),
  body('whatsappNumber')
    .matches(/^[0-9]{6,15}$/)
    .withMessage('WhatsApp number must be 6-15 digits'),
  body('deviceId')
    .notEmpty()
    .withMessage('Device ID is required')
];

// @desc    Register user for tournament
// @route   POST /api/v1/auth/tournament-register
// @access  Public
router.post('/tournament-register', authLimiter, tournamentRegisterValidation, async (req, res, next) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { ign, uid, countryCode, whatsappNumber, deviceId } = req.body;

    // Check if Free Fire ID already exists
    const existingUser = await User.findOne({
      $or: [
        { 'gaming.freeFireId': uid },
        { deviceId: deviceId }
      ]
    });

    if (existingUser) {
      if (existingUser.gaming.freeFireId === uid) {
        return res.status(400).json({
          success: false,
          error: 'Free Fire ID already registered'
        });
      }
      if (existingUser.deviceId === deviceId) {
        return res.status(400).json({
          success: false,
          error: 'Device already registered'
        });
      }
    }

    // Create full phone number
    const fullPhoneNumber = `${countryCode}${whatsappNumber}`;

    // Generate username from IGN (make it unique if needed)
    let username = ign.toLowerCase();
    let usernameExists = await User.findOne({ username });
    let counter = 1;
    while (usernameExists) {
      username = `${ign.toLowerCase()}${counter}`;
      usernameExists = await User.findOne({ username });
      counter++;
    }

    // Generate a temporary email and password for tournament users
    const tempEmail = `${username}@tournament.srbird.local`;
    const tempPassword = Math.random().toString(36).substring(2, 15);

    // Create user
    const user = await User.create({
      username,
      email: tempEmail,
      password: tempPassword,
      deviceId,
      gaming: {
        freeFireId: uid,
        freeFireName: ign
      },
      profile: {
        phoneNumber: fullPhoneNumber
      },
      role: 'user',
      isVerified: true // Auto-verify tournament registrations
    });

    // Find or create default tournament for registrations
    let defaultTournament = await Tournament.findOne({
      title: 'SR Bird 1v1 Free Fire Tournament',
      status: { $in: ['registration_open', 'upcoming'] }
    });

    if (!defaultTournament) {
      // Create default tournament if it doesn't exist
      defaultTournament = await Tournament.create({
        title: 'SR Bird 1v1 Free Fire Tournament',
        description: 'Official 1v1 Free Fire Tournament by SR Bird',
        gameType: 'Free Fire',
        tournamentType: '1v1',
        maxParticipants: 64,
        entryFee: 30,
        prizePool: 1500,
        status: 'registration_open',
        registrationStart: new Date(),
        registrationEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
        tournamentStart: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
        organizer: user._id, // Use the first user as organizer, can be changed later
        isPublished: true,
        isFeatured: true
      });
    }

    // Add user to tournament as participant (with pending payment status)
    try {
      await defaultTournament.addParticipant(user._id);
    } catch (error) {
      console.log('User might already be in tournament or tournament is full:', error.message);
    }

    // Generate token
    const token = user.getSignedJwtToken();

    // Remove password from response
    const userResponse = {
      id: user._id,
      username: user.username,
      gaming: {
        freeFireId: user.gaming.freeFireId,
        freeFireName: user.gaming.freeFireName
      },
      profile: {
        phoneNumber: user.profile.phoneNumber
      },
      createdAt: user.createdAt
    };

    res.status(201).json({
      success: true,
      message: 'Tournament registration successful',
      data: {
        token,
        user: userResponse
      }
    });

  } catch (error) {
    console.error('Tournament registration error:', error);
    next(error);
  }
});

// @desc    Register user
// @route   POST /api/v1/auth/register
// @access  Public
router.post('/register', authLimiter, registerValidation, async (req, res, next) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const {
      username,
      email,
      password,
      deviceId,
      freeFireId,
      freeFireName,
      phoneNumber,
      firstName,
      lastName,
      country
    } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [
        { email },
        { username },
        { deviceId },
        ...(freeFireId ? [{ 'gaming.freeFireId': freeFireId }] : [])
      ]
    });

    if (existingUser) {
      let errorMessage = 'User already exists';
      if (existingUser.email === email) errorMessage = 'Email already registered';
      else if (existingUser.username === username) errorMessage = 'Username already taken';
      else if (existingUser.deviceId === deviceId) errorMessage = 'Device already registered';
      else if (existingUser.gaming.freeFireId === freeFireId) errorMessage = 'Free Fire ID already registered';

      return res.status(400).json({
        success: false,
        error: errorMessage
      });
    }

    // Create user
    const user = await User.create({
      username,
      email,
      password,
      deviceId,
      profile: {
        firstName,
        lastName,
        country,
        phoneNumber
      },
      gaming: {
        freeFireId,
        freeFireName
      },
      lastLoginIP: req.ip
    });

    // Generate tokens
    const token = user.getSignedJwtToken();
    const refreshToken = user.getRefreshToken();

    // Cache user data
    await cache.set(`user_${user._id}`, user, 900); // 15 minutes

    logger.info(`New user registered: ${username} (${email})`);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        token,
        refreshToken,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          profile: user.profile,
          gaming: user.gaming,
          isVerified: user.isVerified,
          createdAt: user.createdAt
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
router.post('/login', loginLimiter, loginValidation, async (req, res, next) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { login, password, deviceId } = req.body;

    // Find user by email or username
    const user = await User.findOne({
      $or: [
        { email: login.toLowerCase() },
        { username: login }
      ]
    }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check if account is locked
    if (user.isLocked) {
      return res.status(423).json({
        success: false,
        error: 'Account temporarily locked due to too many failed login attempts'
      });
    }

    // Check if account is banned
    if (user.isBanned) {
      const message = user.banExpiresAt && user.banExpiresAt > new Date()
        ? `Account banned until ${user.banExpiresAt.toISOString()}`
        : 'Account permanently banned';
      
      return res.status(403).json({
        success: false,
        error: message,
        reason: user.banReason
      });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Account has been deactivated'
      });
    }

    // Check password
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      // Increment login attempts
      await user.incLoginAttempts();
      
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check device ID (optional security check)
    if (user.deviceId !== deviceId) {
      logger.warn(`Device ID mismatch for user ${user.username}: expected ${user.deviceId}, got ${deviceId}`);
      // You can choose to allow or deny based on your security requirements
      // For now, we'll allow but log the event
    }

    // Reset login attempts on successful login
    await user.resetLoginAttempts();

    // Update last login info
    user.lastLoginAt = new Date();
    user.lastLoginIP = req.ip;
    await user.save();

    // Generate tokens
    const token = user.getSignedJwtToken();
    const refreshToken = user.getRefreshToken();

    // Cache user data
    await cache.set(`user_${user._id}`, user, 900); // 15 minutes

    logger.info(`User logged in: ${user.username} from IP ${req.ip}`);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        refreshToken,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          profile: user.profile,
          gaming: user.gaming,
          stats: user.stats,
          isVerified: user.isVerified,
          lastLoginAt: user.lastLoginAt
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Logout user
// @route   POST /api/v1/auth/logout
// @access  Private
router.post('/logout', protect, async (req, res, next) => {
  try {
    const token = req.headers.authorization.split(' ')[1];
    
    // Add token to blacklist (cache for token expiry time)
    const tokenExpiry = 7 * 24 * 60 * 60; // 7 days in seconds
    await cache.set(`blacklist_${token}`, true, tokenExpiry);
    
    // Remove user from cache
    await cache.del(`user_${req.user._id}`);
    
    logger.info(`User logged out: ${req.user.username}`);
    
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get current logged in user
// @route   GET /api/v1/auth/me
// @access  Private
router.get('/me', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    
    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          role: user.role,
          profile: user.profile,
          gaming: user.gaming,
          stats: user.stats,
          isVerified: user.isVerified,
          isActive: user.isActive,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Refresh access token
// @route   POST /api/v1/auth/refresh
// @access  Public
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: 'Refresh token is required'
      });
    }
    
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    // Find user
    const user = await User.findById(decoded.id);
    
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token'
      });
    }
    
    // Generate new access token
    const newToken = user.getSignedJwtToken();
    
    res.status(200).json({
      success: true,
      data: {
        token: newToken
      }
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: 'Invalid refresh token'
    });
  }
});

module.exports = router;
