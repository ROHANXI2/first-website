const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Tournament = require('../models/Tournament');
const User = require('../models/User');
const Payment = require('../models/Payment');
const { protect, authorize, optionalAuth } = require('../middleware/auth');
const logger = require('../utils/logger');
const { cache } = require('../config/redis');

const router = express.Router();

// @desc    Get all tournaments
// @route   GET /api/v1/tournaments
// @access  Public
router.get('/', optionalAuth, [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('status').optional().isIn(['draft', 'upcoming', 'registration_open', 'registration_closed', 'ongoing', 'completed', 'cancelled']),
  query('gameType').optional().isIn(['Free Fire', 'PUBG Mobile', 'Call of Duty Mobile', 'Valorant Mobile']),
  query('tournamentType').optional().isIn(['1v1', '2v2', '4v4', 'Squad', 'Battle Royale', 'Custom']),
  query('search').optional().isLength({ min: 1 }).withMessage('Search term cannot be empty'),
  query('featured').optional().isBoolean().withMessage('Featured must be boolean')
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
    let query = { isPublished: true };
    
    // Only show non-draft tournaments to non-admin users
    if (!req.user || req.user.role !== 'admin') {
      query.status = { $ne: 'draft' };
    }

    if (req.query.status) query.status = req.query.status;
    if (req.query.gameType) query.gameType = req.query.gameType;
    if (req.query.tournamentType) query.tournamentType = req.query.tournamentType;
    if (req.query.featured !== undefined) query.isFeatured = req.query.featured === 'true';

    if (req.query.search) {
      query.$or = [
        { title: { $regex: req.query.search, $options: 'i' } },
        { description: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Check cache first
    const cacheKey = `tournaments_${JSON.stringify(query)}_${page}_${limit}`;
    let cachedResult = await cache.get(cacheKey);

    if (cachedResult) {
      return res.status(200).json({
        success: true,
        data: cachedResult,
        cached: true
      });
    }

    // Execute query
    const tournaments = await Tournament.find(query)
      .populate('organizer', 'username profile.firstName profile.lastName')
      .select('-participants.paymentId -participants.paymentStatus')
      .sort({ isFeatured: -1, tournamentStart: 1 })
      .skip(skip)
      .limit(limit);

    const total = await Tournament.countDocuments(query);

    const result = {
      tournaments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };

    // Cache for 5 minutes
    await cache.set(cacheKey, result, 300);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get single tournament
// @route   GET /api/v1/tournaments/:id
// @access  Public
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const tournament = await Tournament.findById(req.params.id)
      .populate('organizer', 'username profile.firstName profile.lastName')
      .populate('participants.user', 'username gaming.freeFireName profile.avatar')
      .populate('moderators', 'username profile.firstName profile.lastName');

    if (!tournament) {
      return res.status(404).json({
        success: false,
        error: 'Tournament not found'
      });
    }

    // Check if user can view this tournament
    if (!tournament.isPublished && (!req.user || req.user.role !== 'admin')) {
      return res.status(404).json({
        success: false,
        error: 'Tournament not found'
      });
    }

    // Hide sensitive participant information for non-admin users
    if (!req.user || req.user.role !== 'admin') {
      tournament.participants = tournament.participants.map(p => ({
        user: p.user,
        registeredAt: p.registeredAt,
        status: p.status,
        teamName: p.teamName,
        seed: p.seed
      }));
    }

    res.status(200).json({
      success: true,
      data: { tournament }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Create tournament
// @route   POST /api/v1/tournaments
// @access  Private/Admin
router.post('/', protect, authorize('admin'), [
  body('title').notEmpty().isLength({ max: 100 }).withMessage('Title is required and cannot exceed 100 characters'),
  body('description').notEmpty().isLength({ max: 1000 }).withMessage('Description is required and cannot exceed 1000 characters'),
  body('gameType').isIn(['Free Fire', 'PUBG Mobile', 'Call of Duty Mobile', 'Valorant Mobile']).withMessage('Invalid game type'),
  body('tournamentType').isIn(['1v1', '2v2', '4v4', 'Squad', 'Battle Royale', 'Custom']).withMessage('Invalid tournament type'),
  body('maxParticipants').isInt({ min: 2, max: 1000 }).withMessage('Max participants must be between 2 and 1000'),
  body('entryFee').isFloat({ min: 0 }).withMessage('Entry fee cannot be negative'),
  body('prizePool.total').isFloat({ min: 0 }).withMessage('Prize pool cannot be negative'),
  body('registrationStart').isISO8601().withMessage('Invalid registration start date'),
  body('registrationEnd').isISO8601().withMessage('Invalid registration end date'),
  body('tournamentStart').isISO8601().withMessage('Invalid tournament start date'),
  body('tournamentEnd').isISO8601().withMessage('Invalid tournament end date')
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

    // Validate date sequence
    const { registrationStart, registrationEnd, tournamentStart, tournamentEnd } = req.body;
    const regStart = new Date(registrationStart);
    const regEnd = new Date(registrationEnd);
    const tourStart = new Date(tournamentStart);
    const tourEnd = new Date(tournamentEnd);

    if (regStart >= regEnd) {
      return res.status(400).json({
        success: false,
        error: 'Registration end must be after registration start'
      });
    }

    if (regEnd >= tourStart) {
      return res.status(400).json({
        success: false,
        error: 'Tournament start must be after registration end'
      });
    }

    if (tourStart >= tourEnd) {
      return res.status(400).json({
        success: false,
        error: 'Tournament end must be after tournament start'
      });
    }

    // Create tournament
    const tournament = await Tournament.create({
      ...req.body,
      organizer: req.user._id,
      registrationStart: regStart,
      registrationEnd: regEnd,
      tournamentStart: tourStart,
      tournamentEnd: tourEnd
    });

    await tournament.populate('organizer', 'username profile.firstName profile.lastName');

    logger.info(`Tournament created: ${tournament.title} by ${req.user.username}`);

    res.status(201).json({
      success: true,
      message: 'Tournament created successfully',
      data: { tournament }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update tournament
// @route   PUT /api/v1/tournaments/:id
// @access  Private/Admin
router.put('/:id', protect, authorize('admin'), [
  body('title').optional().isLength({ max: 100 }).withMessage('Title cannot exceed 100 characters'),
  body('description').optional().isLength({ max: 1000 }).withMessage('Description cannot exceed 1000 characters'),
  body('maxParticipants').optional().isInt({ min: 2, max: 1000 }).withMessage('Max participants must be between 2 and 1000'),
  body('entryFee').optional().isFloat({ min: 0 }).withMessage('Entry fee cannot be negative'),
  body('prizePool.total').optional().isFloat({ min: 0 }).withMessage('Prize pool cannot be negative')
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

    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        error: 'Tournament not found'
      });
    }

    // Check if tournament can be updated
    if (tournament.status === 'ongoing' || tournament.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot update tournament that is ongoing or completed'
      });
    }

    // Update tournament
    const updatedTournament = await Tournament.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('organizer', 'username profile.firstName profile.lastName');

    // Clear cache
    await cache.del(`tournaments_*`);

    logger.info(`Tournament updated: ${updatedTournament.title} by ${req.user.username}`);

    res.status(200).json({
      success: true,
      message: 'Tournament updated successfully',
      data: { tournament: updatedTournament }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete tournament
// @route   DELETE /api/v1/tournaments/:id
// @access  Private/Admin
router.delete('/:id', protect, authorize('admin'), async (req, res, next) => {
  try {
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        error: 'Tournament not found'
      });
    }

    // Check if tournament can be deleted
    if (tournament.status === 'ongoing') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete ongoing tournament'
      });
    }

    // If tournament has participants with completed payments, cancel instead of delete
    const paidParticipants = tournament.participants.filter(p => p.paymentStatus === 'completed');
    
    if (paidParticipants.length > 0) {
      tournament.status = 'cancelled';
      await tournament.save();
      
      logger.info(`Tournament cancelled: ${tournament.title} by ${req.user.username}`);
      
      return res.status(200).json({
        success: true,
        message: 'Tournament cancelled due to existing paid registrations'
      });
    }

    await Tournament.findByIdAndDelete(req.params.id);

    // Clear cache
    await cache.del(`tournaments_*`);

    logger.info(`Tournament deleted: ${tournament.title} by ${req.user.username}`);

    res.status(200).json({
      success: true,
      message: 'Tournament deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Register for tournament
// @route   POST /api/v1/tournaments/:id/register
// @access  Private
router.post('/:id/register', protect, [
  body('teamName').optional().isLength({ max: 50 }).withMessage('Team name cannot exceed 50 characters')
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

    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        error: 'Tournament not found'
      });
    }

    // Check if registration is open
    if (tournament.registrationStatus !== 'open') {
      return res.status(400).json({
        success: false,
        error: 'Registration is not open for this tournament'
      });
    }

    // Check if user is already registered
    const existingParticipant = tournament.participants.find(
      p => p.user.toString() === req.user._id.toString()
    );

    if (existingParticipant) {
      return res.status(400).json({
        success: false,
        error: 'You are already registered for this tournament'
      });
    }

    // Check if tournament is full
    if (tournament.currentParticipants >= tournament.maxParticipants) {
      return res.status(400).json({
        success: false,
        error: 'Tournament is full'
      });
    }

    // Check user requirements
    const user = await User.findById(req.user._id);
    
    if (tournament.requirements.minLevel && user.gaming.level < tournament.requirements.minLevel) {
      return res.status(400).json({
        success: false,
        error: `Minimum level requirement: ${tournament.requirements.minLevel}`
      });
    }

    // Add participant
    tournament.participants.push({
      user: req.user._id,
      teamName: req.body.teamName,
      registeredAt: new Date(),
      paymentStatus: tournament.entryFee > 0 ? 'pending' : 'completed'
    });

    await tournament.save();

    // Clear cache
    await cache.del(`tournaments_*`);

    logger.info(`User registered for tournament: ${req.user.username} -> ${tournament.title}`);

    res.status(200).json({
      success: true,
      message: 'Successfully registered for tournament',
      data: {
        tournament: {
          id: tournament._id,
          title: tournament.title,
          entryFee: tournament.entryFee,
          paymentRequired: tournament.entryFee > 0
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Unregister from tournament
// @route   DELETE /api/v1/tournaments/:id/register
// @access  Private
router.delete('/:id/register', protect, async (req, res, next) => {
  try {
    const tournament = await Tournament.findById(req.params.id);

    if (!tournament) {
      return res.status(404).json({
        success: false,
        error: 'Tournament not found'
      });
    }

    // Find participant
    const participantIndex = tournament.participants.findIndex(
      p => p.user.toString() === req.user._id.toString()
    );

    if (participantIndex === -1) {
      return res.status(400).json({
        success: false,
        error: 'You are not registered for this tournament'
      });
    }

    const participant = tournament.participants[participantIndex];

    // Check if unregistration is allowed
    if (tournament.status === 'ongoing' || tournament.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot unregister from ongoing or completed tournament'
      });
    }

    // If payment was completed, initiate refund process
    if (participant.paymentStatus === 'completed') {
      // Mark for refund processing
      participant.status = 'withdrawn';
      participant.paymentStatus = 'refunded';
      
      // TODO: Implement actual refund processing
      logger.info(`Refund initiated for user: ${req.user.username} from tournament: ${tournament.title}`);
    } else {
      // Remove participant completely if no payment was made
      tournament.participants.splice(participantIndex, 1);
    }

    await tournament.save();

    // Clear cache
    await cache.del(`tournaments_*`);

    logger.info(`User unregistered from tournament: ${req.user.username} -> ${tournament.title}`);

    res.status(200).json({
      success: true,
      message: 'Successfully unregistered from tournament'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
