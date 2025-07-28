const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Match = require('../models/Match');
const Tournament = require('../models/Tournament');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const logger = require('../utils/logger');
const { generateBracket } = require('../utils/bracketGenerator');

const router = express.Router();

// @desc    Get matches
// @route   GET /api/v1/matches
// @access  Private
router.get('/', protect, [
  query('tournament').optional().isMongoId().withMessage('Invalid tournament ID'),
  query('status').optional().isIn(['scheduled', 'ready', 'ongoing', 'paused', 'completed', 'cancelled', 'disputed']),
  query('participant').optional().isMongoId().withMessage('Invalid participant ID'),
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
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Build query
    let query = {};
    
    if (req.query.tournament) {
      query.tournament = req.query.tournament;
    }
    
    if (req.query.status) {
      query.status = req.query.status;
    }
    
    if (req.query.participant) {
      query['participants.user'] = req.query.participant;
    }

    // If not admin, only show matches user is participating in
    if (req.user.role !== 'admin' && !req.query.participant) {
      query['participants.user'] = req.user._id;
    }

    const matches = await Match.find(query)
      .populate('tournament', 'title gameType tournamentType')
      .populate('participants.user', 'username gaming.freeFireName profile.avatar')
      .populate('winner', 'username gaming.freeFireName')
      .populate('moderator', 'username')
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

// @desc    Get single match
// @route   GET /api/v1/matches/:id
// @access  Private
router.get('/:id', protect, async (req, res, next) => {
  try {
    const match = await Match.findById(req.params.id)
      .populate('tournament', 'title gameType tournamentType rules')
      .populate('participants.user', 'username gaming.freeFireName profile.avatar gaming.rank')
      .populate('winner', 'username gaming.freeFireName')
      .populate('moderator', 'username profile.firstName profile.lastName')
      .populate('chat.user', 'username profile.avatar')
      .populate('disputes.reportedBy', 'username')
      .populate('disputes.resolvedBy', 'username');

    if (!match) {
      return res.status(404).json({
        success: false,
        error: 'Match not found'
      });
    }

    // Check if user can view this match
    const isParticipant = match.participants.some(p => p.user._id.toString() === req.user._id.toString());
    const isModerator = match.moderator && match.moderator._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isParticipant && !isModerator && !isAdmin) {
      // Return limited public view
      const publicMatch = {
        _id: match._id,
        tournament: match.tournament,
        status: match.status,
        scheduledAt: match.scheduledAt,
        participants: match.participants.map(p => ({
          user: {
            _id: p.user._id,
            username: p.user.username,
            gaming: p.user.gaming
          },
          status: p.status
        })),
        winner: match.winner,
        result: match.result
      };

      return res.status(200).json({
        success: true,
        data: { match: publicMatch }
      });
    }

    res.status(200).json({
      success: true,
      data: { match }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Create match (admin/moderator only)
// @route   POST /api/v1/matches
// @access  Private/Admin
router.post('/', protect, authorize('admin', 'moderator'), [
  body('tournament').isMongoId().withMessage('Invalid tournament ID'),
  body('participants').isArray({ min: 2, max: 4 }).withMessage('Match must have 2-4 participants'),
  body('participants.*.user').isMongoId().withMessage('Invalid participant user ID'),
  body('gameMode').isIn(['1v1', '2v2', '4v4', 'Squad', 'Battle Royale', 'Custom']).withMessage('Invalid game mode'),
  body('scheduledAt').isISO8601().withMessage('Invalid scheduled date'),
  body('mapName').optional().isLength({ max: 100 }).withMessage('Map name too long'),
  body('roomId').optional().isLength({ max: 50 }).withMessage('Room ID too long'),
  body('roomPassword').optional().isLength({ max: 50 }).withMessage('Room password too long')
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

    const { tournament: tournamentId, participants, scheduledAt, ...matchData } = req.body;

    // Verify tournament exists
    const tournament = await Tournament.findById(tournamentId);
    if (!tournament) {
      return res.status(404).json({
        success: false,
        error: 'Tournament not found'
      });
    }

    // Verify all participants are registered in the tournament
    for (const participant of participants) {
      const isRegistered = tournament.participants.some(
        p => p.user.toString() === participant.user && p.status === 'confirmed'
      );
      
      if (!isRegistered) {
        return res.status(400).json({
          success: false,
          error: `User ${participant.user} is not registered in this tournament`
        });
      }
    }

    // Generate match number
    const matchCount = await Match.countDocuments({ tournament: tournamentId });
    const matchNumber = matchCount + 1;

    // Create match
    const match = await Match.create({
      tournament: tournamentId,
      matchNumber,
      round: req.body.round || 1,
      bracketPosition: req.body.bracketPosition || `R1-M${matchNumber}`,
      participants: participants.map(p => ({
        user: p.user,
        teamName: p.teamName,
        seed: p.seed
      })),
      scheduledAt: new Date(scheduledAt),
      moderator: req.user._id,
      ...matchData
    });

    await match.populate('tournament', 'title gameType')
                .populate('participants.user', 'username gaming.freeFireName');

    logger.info(`Match created: ${match._id} for tournament ${tournament.title} by ${req.user.username}`);

    res.status(201).json({
      success: true,
      message: 'Match created successfully',
      data: { match }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update match
// @route   PUT /api/v1/matches/:id
// @access  Private/Admin/Moderator
router.put('/:id', protect, [
  body('scheduledAt').optional().isISO8601().withMessage('Invalid scheduled date'),
  body('mapName').optional().isLength({ max: 100 }).withMessage('Map name too long'),
  body('roomId').optional().isLength({ max: 50 }).withMessage('Room ID too long'),
  body('roomPassword').optional().isLength({ max: 50 }).withMessage('Room password too long'),
  body('status').optional().isIn(['scheduled', 'ready', 'ongoing', 'paused', 'completed', 'cancelled', 'disputed'])
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

    const match = await Match.findById(req.params.id);
    
    if (!match) {
      return res.status(404).json({
        success: false,
        error: 'Match not found'
      });
    }

    // Check permissions
    const isModerator = match.moderator && match.moderator.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    
    if (!isModerator && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this match'
      });
    }

    // Update match
    const updatedMatch = await Match.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('tournament', 'title gameType')
     .populate('participants.user', 'username gaming.freeFireName')
     .populate('winner', 'username gaming.freeFireName');

    logger.info(`Match updated: ${match._id} by ${req.user.username}`);

    res.status(200).json({
      success: true,
      message: 'Match updated successfully',
      data: { match: updatedMatch }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Set participant ready status
// @route   POST /api/v1/matches/:id/ready
// @access  Private
router.post('/:id/ready', protect, [
  body('ready').isBoolean().withMessage('Ready status must be boolean')
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

    const match = await Match.findById(req.params.id);
    
    if (!match) {
      return res.status(404).json({
        success: false,
        error: 'Match not found'
      });
    }

    // Check if user is a participant
    const participant = match.participants.find(p => p.user.toString() === req.user._id.toString());
    
    if (!participant) {
      return res.status(403).json({
        success: false,
        error: 'You are not a participant in this match'
      });
    }

    // Update ready status
    await match.setParticipantReady(req.user._id, req.body.ready);

    // Get updated match
    const updatedMatch = await Match.findById(req.params.id)
      .populate('participants.user', 'username gaming.freeFireName');

    // Emit socket event for real-time updates
    const io = req.app.get('io');
    if (io) {
      io.to(`match_${match._id}`).emit('participantReady', {
        matchId: match._id,
        userId: req.user._id,
        ready: req.body.ready,
        allReady: updatedMatch.allParticipantsReady
      });
    }

    logger.info(`Participant ready status updated: ${req.user.username} - ${req.body.ready} in match ${match._id}`);

    res.status(200).json({
      success: true,
      message: `Marked as ${req.body.ready ? 'ready' : 'not ready'}`,
      data: {
        match: updatedMatch,
        allParticipantsReady: updatedMatch.allParticipantsReady
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Start match
// @route   POST /api/v1/matches/:id/start
// @access  Private/Admin/Moderator
router.post('/:id/start', protect, async (req, res, next) => {
  try {
    const match = await Match.findById(req.params.id);
    
    if (!match) {
      return res.status(404).json({
        success: false,
        error: 'Match not found'
      });
    }

    // Check permissions
    const isModerator = match.moderator && match.moderator.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    
    if (!isModerator && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to start this match'
      });
    }

    // Start match
    await match.startMatch();

    // Get updated match
    const updatedMatch = await Match.findById(req.params.id)
      .populate('participants.user', 'username gaming.freeFireName');

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`match_${match._id}`).emit('matchStarted', {
        matchId: match._id,
        startedAt: updatedMatch.startedAt
      });
    }

    logger.info(`Match started: ${match._id} by ${req.user.username}`);

    res.status(200).json({
      success: true,
      message: 'Match started successfully',
      data: { match: updatedMatch }
    });
  } catch (error) {
    if (error.message.includes('not ready') || error.message.includes('not all participants')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    next(error);
  }
});

// @desc    End match and submit result
// @route   POST /api/v1/matches/:id/end
// @access  Private/Admin/Moderator
router.post('/:id/end', protect, [
  body('winner').optional().isMongoId().withMessage('Invalid winner ID'),
  body('result').isIn(['player1_win', 'player2_win', 'draw', 'no_contest', 'disputed']).withMessage('Invalid result'),
  body('scores').optional().isArray().withMessage('Scores must be an array'),
  body('scores.*.user').optional().isMongoId().withMessage('Invalid user ID in scores'),
  body('scores.*.kills').optional().isInt({ min: 0 }).withMessage('Kills must be non-negative'),
  body('scores.*.deaths').optional().isInt({ min: 0 }).withMessage('Deaths must be non-negative'),
  body('scores.*.damage').optional().isInt({ min: 0 }).withMessage('Damage must be non-negative')
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

    const match = await Match.findById(req.params.id);
    
    if (!match) {
      return res.status(404).json({
        success: false,
        error: 'Match not found'
      });
    }

    // Check permissions
    const isModerator = match.moderator && match.moderator.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    
    if (!isModerator && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to end this match'
      });
    }

    const { winner, result, scores } = req.body;

    // End match
    await match.endMatch(winner, result, scores);

    // Get updated match
    const updatedMatch = await Match.findById(req.params.id)
      .populate('participants.user', 'username gaming.freeFireName')
      .populate('winner', 'username gaming.freeFireName');

    // Update user statistics
    if (winner && result !== 'no_contest') {
      await User.findByIdAndUpdate(winner, {
        $inc: {
          'stats.tournamentsWon': 1,
          'stats.currentStreak': 1
        }
      });

      // Update best streak if current is higher
      const winnerUser = await User.findById(winner);
      if (winnerUser.stats.currentStreak > winnerUser.stats.bestStreak) {
        winnerUser.stats.bestStreak = winnerUser.stats.currentStreak;
        await winnerUser.save();
      }

      // Reset streak for loser
      const loserId = match.participants.find(p => p.user.toString() !== winner.toString())?.user;
      if (loserId) {
        await User.findByIdAndUpdate(loserId, {
          $set: { 'stats.currentStreak': 0 }
        });
      }
    }

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`match_${match._id}`).emit('matchEnded', {
        matchId: match._id,
        winner: updatedMatch.winner,
        result: updatedMatch.result,
        endedAt: updatedMatch.endedAt
      });
    }

    logger.info(`Match ended: ${match._id} - Result: ${result} by ${req.user.username}`);

    res.status(200).json({
      success: true,
      message: 'Match ended successfully',
      data: { match: updatedMatch }
    });
  } catch (error) {
    if (error.message.includes('not ongoing')) {
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
    next(error);
  }
});

module.exports = router;
