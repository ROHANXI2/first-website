const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Match = require('../models/Match');
const Tournament = require('../models/Tournament');
const logger = require('../utils/logger');

// Store active connections
const activeConnections = new Map();
const matchRooms = new Map();
const tournamentRooms = new Map();

const socketHandler = (io) => {
  // Authentication middleware for socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user || !user.isActive) {
        return next(new Error('Invalid or inactive user'));
      }

      socket.user = user;
      next();
    } catch (error) {
      logger.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`User connected: ${socket.user.username} (${socket.id})`);
    
    // Store active connection
    activeConnections.set(socket.user._id.toString(), {
      socketId: socket.id,
      user: socket.user,
      connectedAt: new Date()
    });

    // Join user to their personal room for notifications
    socket.join(`user_${socket.user._id}`);

    // Send connection confirmation
    socket.emit('connected', {
      message: 'Connected successfully',
      user: {
        id: socket.user._id,
        username: socket.user.username,
        role: socket.user.role
      }
    });

    // Handle joining match rooms
    socket.on('joinMatch', async (data) => {
      try {
        const { matchId } = data;
        
        const match = await Match.findById(matchId)
          .populate('participants.user', 'username');
        
        if (!match) {
          return socket.emit('error', { message: 'Match not found' });
        }

        // Check if user is participant, moderator, or admin
        const isParticipant = match.participants.some(p => p.user._id.toString() === socket.user._id.toString());
        const isModerator = match.moderator && match.moderator.toString() === socket.user._id.toString();
        const isAdmin = socket.user.role === 'admin';

        if (!isParticipant && !isModerator && !isAdmin) {
          return socket.emit('error', { message: 'Not authorized to join this match' });
        }

        // Join match room
        socket.join(`match_${matchId}`);
        
        // Track match room participants
        if (!matchRooms.has(matchId)) {
          matchRooms.set(matchId, new Set());
        }
        matchRooms.get(matchId).add(socket.user._id.toString());

        // Notify others in the match room
        socket.to(`match_${matchId}`).emit('userJoinedMatch', {
          matchId,
          user: {
            id: socket.user._id,
            username: socket.user.username
          }
        });

        socket.emit('matchJoined', {
          matchId,
          participants: Array.from(matchRooms.get(matchId))
        });

        logger.info(`User ${socket.user.username} joined match ${matchId}`);
      } catch (error) {
        logger.error('Error joining match:', error);
        socket.emit('error', { message: 'Failed to join match' });
      }
    });

    // Handle leaving match rooms
    socket.on('leaveMatch', (data) => {
      const { matchId } = data;
      
      socket.leave(`match_${matchId}`);
      
      if (matchRooms.has(matchId)) {
        matchRooms.get(matchId).delete(socket.user._id.toString());
        
        if (matchRooms.get(matchId).size === 0) {
          matchRooms.delete(matchId);
        }
      }

      socket.to(`match_${matchId}`).emit('userLeftMatch', {
        matchId,
        user: {
          id: socket.user._id,
          username: socket.user.username
        }
      });

      logger.info(`User ${socket.user.username} left match ${matchId}`);
    });

    // Handle joining tournament rooms
    socket.on('joinTournament', async (data) => {
      try {
        const { tournamentId } = data;
        
        const tournament = await Tournament.findById(tournamentId);
        
        if (!tournament) {
          return socket.emit('error', { message: 'Tournament not found' });
        }

        // Check if user is participant or admin
        const isParticipant = tournament.participants.some(p => p.user.toString() === socket.user._id.toString());
        const isAdmin = socket.user.role === 'admin';

        if (!isParticipant && !isAdmin && !tournament.settings.allowSpectators) {
          return socket.emit('error', { message: 'Not authorized to join this tournament' });
        }

        // Join tournament room
        socket.join(`tournament_${tournamentId}`);
        
        // Track tournament room participants
        if (!tournamentRooms.has(tournamentId)) {
          tournamentRooms.set(tournamentId, new Set());
        }
        tournamentRooms.get(tournamentId).add(socket.user._id.toString());

        socket.emit('tournamentJoined', {
          tournamentId,
          participants: Array.from(tournamentRooms.get(tournamentId))
        });

        logger.info(`User ${socket.user.username} joined tournament ${tournamentId}`);
      } catch (error) {
        logger.error('Error joining tournament:', error);
        socket.emit('error', { message: 'Failed to join tournament' });
      }
    });

    // Handle match chat messages
    socket.on('matchMessage', async (data) => {
      try {
        const { matchId, message } = data;
        
        if (!message || message.trim().length === 0) {
          return socket.emit('error', { message: 'Message cannot be empty' });
        }

        if (message.length > 500) {
          return socket.emit('error', { message: 'Message too long' });
        }

        const match = await Match.findById(matchId);
        
        if (!match) {
          return socket.emit('error', { message: 'Match not found' });
        }

        // Check if user is participant
        const isParticipant = match.participants.some(p => p.user.toString() === socket.user._id.toString());
        
        if (!isParticipant) {
          return socket.emit('error', { message: 'Only participants can send messages' });
        }

        // Add message to match
        await match.addChatMessage(socket.user._id, message.trim());

        // Broadcast message to match room
        io.to(`match_${matchId}`).emit('matchMessage', {
          matchId,
          message: {
            user: {
              id: socket.user._id,
              username: socket.user.username,
              avatar: socket.user.profile.avatar
            },
            message: message.trim(),
            timestamp: new Date(),
            isSystemMessage: false
          }
        });

        logger.info(`Match message from ${socket.user.username} in match ${matchId}`);
      } catch (error) {
        logger.error('Error sending match message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle participant ready status
    socket.on('setReady', async (data) => {
      try {
        const { matchId, ready } = data;
        
        const match = await Match.findById(matchId);
        
        if (!match) {
          return socket.emit('error', { message: 'Match not found' });
        }

        // Check if user is participant
        const participant = match.participants.find(p => p.user.toString() === socket.user._id.toString());
        
        if (!participant) {
          return socket.emit('error', { message: 'You are not a participant in this match' });
        }

        // Update ready status
        await match.setParticipantReady(socket.user._id, ready);

        // Get updated match
        const updatedMatch = await Match.findById(matchId)
          .populate('participants.user', 'username gaming.freeFireName');

        // Broadcast to match room
        io.to(`match_${matchId}`).emit('participantReady', {
          matchId,
          userId: socket.user._id,
          username: socket.user.username,
          ready,
          allReady: updatedMatch.allParticipantsReady
        });

        logger.info(`Participant ready status: ${socket.user.username} - ${ready} in match ${matchId}`);
      } catch (error) {
        logger.error('Error setting ready status:', error);
        socket.emit('error', { message: 'Failed to update ready status' });
      }
    });

    // Handle live match updates (for moderators)
    socket.on('matchUpdate', async (data) => {
      try {
        const { matchId, update } = data;
        
        const match = await Match.findById(matchId);
        
        if (!match) {
          return socket.emit('error', { message: 'Match not found' });
        }

        // Check if user is moderator or admin
        const isModerator = match.moderator && match.moderator.toString() === socket.user._id.toString();
        const isAdmin = socket.user.role === 'admin';
        
        if (!isModerator && !isAdmin) {
          return socket.emit('error', { message: 'Not authorized to update match' });
        }

        // Broadcast update to match room
        io.to(`match_${matchId}`).emit('matchUpdate', {
          matchId,
          update,
          updatedBy: {
            id: socket.user._id,
            username: socket.user.username
          },
          timestamp: new Date()
        });

        logger.info(`Match update from ${socket.user.username} in match ${matchId}:`, update);
      } catch (error) {
        logger.error('Error sending match update:', error);
        socket.emit('error', { message: 'Failed to send match update' });
      }
    });

    // Handle tournament notifications
    socket.on('tournamentNotification', (data) => {
      const { tournamentId, notification } = data;
      
      // Only admins can send tournament notifications
      if (socket.user.role !== 'admin') {
        return socket.emit('error', { message: 'Not authorized to send notifications' });
      }

      io.to(`tournament_${tournamentId}`).emit('tournamentNotification', {
        tournamentId,
        notification,
        timestamp: new Date()
      });

      logger.info(`Tournament notification sent by ${socket.user.username} to tournament ${tournamentId}`);
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info(`User disconnected: ${socket.user.username} (${socket.id}) - Reason: ${reason}`);
      
      // Remove from active connections
      activeConnections.delete(socket.user._id.toString());
      
      // Remove from match rooms
      matchRooms.forEach((participants, matchId) => {
        if (participants.has(socket.user._id.toString())) {
          participants.delete(socket.user._id.toString());
          
          // Notify others in match room
          socket.to(`match_${matchId}`).emit('userLeftMatch', {
            matchId,
            user: {
              id: socket.user._id,
              username: socket.user.username
            }
          });
          
          if (participants.size === 0) {
            matchRooms.delete(matchId);
          }
        }
      });
      
      // Remove from tournament rooms
      tournamentRooms.forEach((participants, tournamentId) => {
        if (participants.has(socket.user._id.toString())) {
          participants.delete(socket.user._id.toString());
          
          if (participants.size === 0) {
            tournamentRooms.delete(tournamentId);
          }
        }
      });
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error(`Socket error from ${socket.user.username}:`, error);
    });
  });

  // Utility functions for sending notifications
  const sendNotificationToUser = (userId, notification) => {
    io.to(`user_${userId}`).emit('notification', {
      ...notification,
      timestamp: new Date()
    });
  };

  const sendNotificationToMatch = (matchId, notification) => {
    io.to(`match_${matchId}`).emit('notification', {
      ...notification,
      timestamp: new Date()
    });
  };

  const sendNotificationToTournament = (tournamentId, notification) => {
    io.to(`tournament_${tournamentId}`).emit('notification', {
      ...notification,
      timestamp: new Date()
    });
  };

  const broadcastToAll = (event, data) => {
    io.emit(event, {
      ...data,
      timestamp: new Date()
    });
  };

  // Expose utility functions
  io.sendNotificationToUser = sendNotificationToUser;
  io.sendNotificationToMatch = sendNotificationToMatch;
  io.sendNotificationToTournament = sendNotificationToTournament;
  io.broadcastToAll = broadcastToAll;
  io.getActiveConnections = () => activeConnections;
  io.getMatchRooms = () => matchRooms;
  io.getTournamentRooms = () => tournamentRooms;

  logger.info('Socket.IO server initialized');
};

module.exports = socketHandler;
