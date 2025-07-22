const express = require('express');
const { body, validationResult, query } = require('express-validator');
const User = require('../models/User');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const { protect, authorize, ownerOrAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');
const { cache } = require('../config/redis');

const router = express.Router();

// @desc    Get all users (admin only)
// @route   GET /api/v1/users
// @access  Private/Admin
router.get('/', protect, authorize('admin'), [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isLength({ min: 1 }).withMessage('Search term cannot be empty'),
  query('role').optional().isIn(['user', 'moderator', 'admin']).withMessage('Invalid role'),
  query('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
  query('isVerified').optional().isBoolean().withMessage('isVerified must be boolean')
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
    
    if (req.query.search) {
      query.$or = [
        { username: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } },
        { 'profile.firstName': { $regex: req.query.search, $options: 'i' } },
        { 'profile.lastName': { $regex: req.query.search, $options: 'i' } },
        { 'gaming.freeFireName': { $regex: req.query.search, $options: 'i' } }
      ];
    }

    if (req.query.role) query.role = req.query.role;
    if (req.query.isActive !== undefined) query.isActive = req.query.isActive === 'true';
    if (req.query.isVerified !== undefined) query.isVerified = req.query.isVerified === 'true';

    // Execute query
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments(query);

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

// @desc    Get user profile
// @route   GET /api/v1/users/:id
// @access  Private
router.get('/:id', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if user can view this profile (own profile or admin)
    if (req.user._id.toString() !== user._id.toString() && req.user.role !== 'admin') {
      // Return limited public profile for other users
      const publicProfile = {
        id: user._id,
        username: user.username,
        profile: {
          firstName: user.profile.firstName,
          lastName: user.profile.lastName,
          avatar: user.profile.avatar,
          country: user.profile.country
        },
        gaming: user.gaming,
        stats: user.stats,
        createdAt: user.createdAt
      };

      return res.status(200).json({
        success: true,
        data: { user: publicProfile }
      });
    }

    res.status(200).json({
      success: true,
      data: { user }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update user profile
// @route   PUT /api/v1/users/:id
// @access  Private
router.put('/:id', protect, [
  body('profile.firstName').optional().isLength({ max: 50 }).withMessage('First name cannot exceed 50 characters'),
  body('profile.lastName').optional().isLength({ max: 50 }).withMessage('Last name cannot exceed 50 characters'),
  body('profile.bio').optional().isLength({ max: 500 }).withMessage('Bio cannot exceed 500 characters'),
  body('profile.country').optional().isLength({ max: 100 }).withMessage('Country cannot exceed 100 characters'),
  body('profile.phoneNumber').optional().matches(/^\+?[1-9]\d{1,14}$/).withMessage('Invalid phone number'),
  body('gaming.freeFireName').optional().isLength({ max: 20 }).withMessage('Free Fire name cannot exceed 20 characters'),
  body('gaming.rank').optional().isIn(['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Grandmaster', 'Heroic']),
  body('gaming.level').optional().isInt({ min: 1, max: 80 }).withMessage('Level must be between 1 and 80'),
  body('gaming.kd').optional().isFloat({ min: 0 }).withMessage('K/D ratio cannot be negative'),
  body('gaming.winRate').optional().isFloat({ min: 0, max: 100 }).withMessage('Win rate must be between 0 and 100')
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

    // Check if user can update this profile
    if (req.user._id.toString() !== req.params.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this profile'
      });
    }

    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Update allowed fields
    const allowedUpdates = ['profile', 'gaming'];
    const updates = {};

    allowedUpdates.forEach(field => {
      if (req.body[field]) {
        updates[field] = { ...user[field].toObject(), ...req.body[field] };
      }
    });

    // Admin can update additional fields
    if (req.user.role === 'admin') {
      const adminFields = ['role', 'isActive', 'isVerified', 'isBanned', 'banReason', 'banExpiresAt'];
      adminFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    // Update cache
    await cache.set(`user_${updatedUser._id}`, updatedUser, 900);

    logger.info(`User profile updated: ${updatedUser.username} by ${req.user.username}`);

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: updatedUser }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete user account
// @route   DELETE /api/v1/users/:id
// @access  Private
router.delete('/:id', protect, async (req, res, next) => {
  try {
    // Check if user can delete this account
    if (req.user._id.toString() !== req.params.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this account'
      });
    }

    const user = await User.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if user has active tournaments
    const activeTournaments = await Tournament.find({
      'participants.user': user._id,
      status: { $in: ['registration_open', 'ongoing'] }
    });

    if (activeTournaments.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete account with active tournament registrations'
      });
    }

    // Soft delete - deactivate account instead of hard delete
    user.isActive = false;
    user.email = `deleted_${Date.now()}_${user.email}`;
    user.username = `deleted_${Date.now()}_${user.username}`;
    await user.save();

    // Remove from cache
    await cache.del(`user_${user._id}`);

    logger.info(`User account deleted: ${user.username} by ${req.user.username}`);

    res.status(200).json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get user's tournament history
// @route   GET /api/v1/users/:id/tournaments
// @access  Private
router.get('/:id/tournaments', protect, [
  query('status').optional().isIn(['upcoming', 'ongoing', 'completed', 'cancelled']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
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
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build query
    let query = { 'participants.user': req.params.id };
    if (req.query.status) {
      query.status = req.query.status;
    }

    const tournaments = await Tournament.find(query)
      .select('title description gameType tournamentType status prizePool tournamentStart participants')
      .sort({ tournamentStart: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Tournament.countDocuments(query);

    // Add user's participation details to each tournament
    const tournamentsWithDetails = tournaments.map(tournament => {
      const participant = tournament.participants.find(p => p.user.toString() === req.params.id);
      return {
        ...tournament.toObject(),
        userParticipation: participant
      };
    });

    res.status(200).json({
      success: true,
      data: {
        tournaments: tournamentsWithDetails,
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

// @desc    Get user's match history
// @route   GET /api/v1/users/:id/matches
// @access  Private
router.get('/:id/matches', protect, [
  query('status').optional().isIn(['scheduled', 'ongoing', 'completed', 'cancelled']),
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 })
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
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build query
    let query = { 'participants.user': req.params.id };
    if (req.query.status) {
      query.status = req.query.status;
    }

    const matches = await Match.find(query)
      .populate('tournament', 'title gameType')
      .populate('participants.user', 'username gaming.freeFireName')
      .populate('winner', 'username gaming.freeFireName')
      .sort({ scheduledAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Match.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        matches,
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

// @desc    Get user statistics
// @route   GET /api/v1/users/:id/stats
// @access  Private
router.get('/:id/stats', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select('stats gaming');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get additional statistics from matches
    const matchStats = await Match.aggregate([
      { $match: { 'participants.user': user._id } },
      {
        $group: {
          _id: null,
          totalMatches: { $sum: 1 },
          wins: {
            $sum: {
              $cond: [{ $eq: ['$winner', user._id] }, 1, 0]
            }
          },
          completedMatches: {
            $sum: {
              $cond: [{ $eq: ['$status', 'completed'] }, 1, 0]
            }
          }
        }
      }
    ]);

    const stats = matchStats[0] || { totalMatches: 0, wins: 0, completedMatches: 0 };
    const winRate = stats.completedMatches > 0 ? (stats.wins / stats.completedMatches * 100).toFixed(2) : 0;

    res.status(200).json({
      success: true,
      data: {
        userStats: user.stats,
        gamingInfo: user.gaming,
        matchStats: {
          ...stats,
          winRate: parseFloat(winRate),
          losses: stats.completedMatches - stats.wins
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
