const express = require('express');
const { body, validationResult, query } = require('express-validator');
const User = require('../models/User');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const Payment = require('../models/Payment');
const { protect, authorize } = require('../middleware/auth');
const logger = require('../utils/logger');
const { cache } = require('../config/redis');
const { generateBracket } = require('../utils/bracketGenerator');

const router = express.Router();

// All admin routes require admin role
router.use(protect);
router.use(authorize('admin'));

// @desc    Get dashboard statistics
// @route   GET /api/v1/admin/dashboard
// @access  Private/Admin
router.get('/dashboard', async (req, res, next) => {
  try {
    // Check cache first
    const cacheKey = 'admin_dashboard_stats';
    let stats = await cache.get(cacheKey);

    if (!stats) {
      // Calculate statistics
      const [
        totalUsers,
        activeUsers,
        totalTournaments,
        activeTournaments,
        totalMatches,
        completedMatches,
        totalRevenue,
        recentPayments
      ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ isActive: true }),
        Tournament.countDocuments(),
        Tournament.countDocuments({ status: { $in: ['registration_open', 'ongoing'] } }),
        Match.countDocuments(),
        Match.countDocuments({ status: 'completed' }),
        Payment.aggregate([
          { $match: { status: 'completed' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        Payment.find({ status: 'completed' })
          .sort({ completedAt: -1 })
          .limit(5)
          .populate('user', 'username')
          .populate('tournament', 'title')
      ]);

      // User growth over last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const userGrowth = await User.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // Tournament statistics by status
      const tournamentStats = await Tournament.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalRevenue: { $sum: '$stats.totalRevenue' }
          }
        }
      ]);

      // Payment statistics by method
      const paymentStats = await Payment.aggregate([
        { $match: { status: 'completed' } },
        {
          $group: {
            _id: '$paymentMethod',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' }
          }
        }
      ]);

      stats = {
        overview: {
          totalUsers,
          activeUsers,
          totalTournaments,
          activeTournaments,
          totalMatches,
          completedMatches,
          totalRevenue: totalRevenue[0]?.total || 0,
          conversionRate: totalUsers > 0 ? ((totalTournaments / totalUsers) * 100).toFixed(2) : 0
        },
        userGrowth,
        tournamentStats,
        paymentStats,
        recentPayments,
        lastUpdated: new Date()
      };

      // Cache for 5 minutes
      await cache.set(cacheKey, stats, 300);
    }

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get user management data
// @route   GET /api/v1/admin/users
// @access  Private/Admin
router.get('/users', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional().isLength({ min: 1 }),
  query('role').optional().isIn(['user', 'moderator', 'admin']),
  query('status').optional().isIn(['active', 'inactive', 'banned']),
  query('sortBy').optional().isIn(['createdAt', 'lastLoginAt', 'username', 'email']),
  query('sortOrder').optional().isIn(['asc', 'desc'])
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const sortBy = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    // Build query
    let query = {};
    
    if (req.query.search) {
      query.$or = [
        { username: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } },
        { 'profile.firstName': { $regex: req.query.search, $options: 'i' } },
        { 'profile.lastName': { $regex: req.query.search, $options: 'i' } }
      ];
    }

    if (req.query.role) {
      query.role = req.query.role;
    }

    if (req.query.status) {
      switch (req.query.status) {
        case 'active':
          query.isActive = true;
          query.isBanned = false;
          break;
        case 'inactive':
          query.isActive = false;
          break;
        case 'banned':
          query.isBanned = true;
          break;
      }
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select('-password')
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit),
      User.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update user (admin actions)
// @route   PUT /api/v1/admin/users/:id
// @access  Private/Admin
router.put('/users/:id', [
  body('role').optional().isIn(['user', 'moderator', 'admin']),
  body('isActive').optional().isBoolean(),
  body('isVerified').optional().isBoolean(),
  body('isBanned').optional().isBoolean(),
  body('banReason').optional().isLength({ max: 500 }),
  body('banExpiresAt').optional().isISO8601()
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Prevent admin from demoting themselves
    if (user._id.toString() === req.user._id.toString() && req.body.role && req.body.role !== 'admin') {
      return res.status(400).json({
        success: false,
        error: 'Cannot change your own admin role'
      });
    }

    // Update user
    const allowedUpdates = ['role', 'isActive', 'isVerified', 'isBanned', 'banReason', 'banExpiresAt'];
    const updates = {};

    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    // Clear user cache
    await cache.del(`user_${user._id}`);

    logger.info(`User updated by admin: ${user.username} by ${req.user.username}`, updates);

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: { user: updatedUser }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get tournament management data
// @route   GET /api/v1/admin/tournaments
// @access  Private/Admin
router.get('/tournaments', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['draft', 'upcoming', 'registration_open', 'registration_closed', 'ongoing', 'completed', 'cancelled']),
  query('gameType').optional().isIn(['Free Fire', 'PUBG Mobile', 'Call of Duty Mobile', 'Valorant Mobile'])
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Build query
    let query = {};
    
    if (req.query.status) {
      query.status = req.query.status;
    }
    
    if (req.query.gameType) {
      query.gameType = req.query.gameType;
    }

    const [tournaments, total] = await Promise.all([
      Tournament.find(query)
        .populate('organizer', 'username profile.firstName profile.lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Tournament.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: {
        tournaments,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Generate tournament bracket
// @route   POST /api/v1/admin/tournaments/:id/generate-bracket
// @access  Private/Admin
router.post('/tournaments/:id/generate-bracket', async (req, res, next) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    
    if (!tournament) {
      return res.status(404).json({
        success: false,
        error: 'Tournament not found'
      });
    }

    if (tournament.status !== 'registration_closed') {
      return res.status(400).json({
        success: false,
        error: 'Can only generate bracket for tournaments with closed registration'
      });
    }

    const bracketResult = await generateBracket(tournament);

    logger.info(`Bracket generated for tournament ${tournament.title} by ${req.user.username}`);

    res.status(200).json({
      success: true,
      message: 'Bracket generated successfully',
      data: bracketResult
    });
  } catch (error) {
    if (error.message.includes('participants required')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    next(error);
  }
});

// @desc    Get payment analytics
// @route   GET /api/v1/admin/payments/analytics
// @access  Private/Admin
router.get('/payments/analytics', [
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('groupBy').optional().isIn(['day', 'week', 'month'])
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
    const groupBy = req.query.groupBy || 'day';

    // Payment analytics
    const paymentAnalytics = await Payment.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            status: '$status',
            date: {
              $dateToString: {
                format: groupBy === 'day' ? '%Y-%m-%d' : groupBy === 'week' ? '%Y-%U' : '%Y-%m',
                date: '$createdAt'
              }
            }
          },
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      },
      {
        $group: {
          _id: '$_id.date',
          payments: {
            $push: {
              status: '$_id.status',
              count: '$count',
              totalAmount: '$totalAmount'
            }
          },
          totalCount: { $sum: '$count' },
          totalRevenue: {
            $sum: {
              $cond: [
                { $eq: ['$_id.status', 'completed'] },
                '$totalAmount',
                0
              ]
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Payment method breakdown
    const paymentMethods = await Payment.aggregate([
      {
        $match: {
          status: 'completed',
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$paymentMethod',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    // Failed payment reasons
    const failureReasons = await Payment.aggregate([
      {
        $match: {
          status: 'failed',
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$failureReason',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.status(200).json({
      success: true,
      data: {
        analytics: paymentAnalytics,
        paymentMethods,
        failureReasons,
        dateRange: { startDate, endDate },
        groupBy
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get system logs
// @route   GET /api/v1/admin/logs
// @access  Private/Admin
router.get('/logs', [
  query('level').optional().isIn(['error', 'warn', 'info', 'debug']),
  query('limit').optional().isInt({ min: 1, max: 1000 })
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const level = req.query.level || 'info';
    const limit = parseInt(req.query.limit) || 100;

    // This is a simplified version - in production, you'd read from log files
    // or use a proper logging service like ELK stack
    
    res.status(200).json({
      success: true,
      message: 'Log viewing requires proper log management system',
      data: {
        logs: [],
        note: 'Implement proper log reading from files or logging service'
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
