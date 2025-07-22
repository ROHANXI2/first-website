const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  // Basic Information
  tournament: {
    type: mongoose.Schema.ObjectId,
    ref: 'Tournament',
    required: [true, 'Tournament is required']
  },
  matchNumber: {
    type: Number,
    required: [true, 'Match number is required']
  },
  round: {
    type: Number,
    required: [true, 'Round number is required'],
    min: [1, 'Round must be at least 1']
  },
  bracketPosition: {
    type: String,
    required: [true, 'Bracket position is required']
  },

  // Participants
  participants: [{
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true
    },
    teamName: {
      type: String,
      trim: true
    },
    seed: {
      type: Number
    },
    status: {
      type: String,
      enum: ['ready', 'not_ready', 'disconnected', 'disqualified'],
      default: 'not_ready'
    },
    joinedAt: {
      type: Date
    }
  }],

  // Match Details
  status: {
    type: String,
    enum: ['scheduled', 'ready', 'ongoing', 'paused', 'completed', 'cancelled', 'disputed'],
    default: 'scheduled'
  },
  gameMode: {
    type: String,
    required: [true, 'Game mode is required'],
    enum: ['1v1', '2v2', '4v4', 'Squad', 'Battle Royale', 'Custom']
  },
  mapName: {
    type: String,
    trim: true
  },
  roomId: {
    type: String,
    trim: true
  },
  roomPassword: {
    type: String,
    trim: true
  },

  // Scheduling
  scheduledAt: {
    type: Date,
    required: [true, 'Scheduled time is required']
  },
  startedAt: {
    type: Date
  },
  endedAt: {
    type: Date
  },
  duration: {
    type: Number, // in seconds
    default: 0
  },

  // Results
  winner: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  result: {
    type: String,
    enum: ['player1_win', 'player2_win', 'draw', 'no_contest', 'disputed'],
  },
  score: [{
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true
    },
    kills: {
      type: Number,
      default: 0,
      min: [0, 'Kills cannot be negative']
    },
    deaths: {
      type: Number,
      default: 0,
      min: [0, 'Deaths cannot be negative']
    },
    damage: {
      type: Number,
      default: 0,
      min: [0, 'Damage cannot be negative']
    },
    placement: {
      type: Number,
      min: [1, 'Placement must be at least 1']
    },
    points: {
      type: Number,
      default: 0
    }
  }],

  // Media and Evidence
  screenshots: [{
    url: {
      type: String,
      required: true
    },
    uploadedBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    },
    description: {
      type: String,
      trim: true
    }
  }],
  streamUrl: {
    type: String,
    trim: true
  },
  replayFile: {
    type: String,
    trim: true
  },

  // Moderation
  moderator: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  disputes: [{
    reportedBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true
    },
    reason: {
      type: String,
      required: [true, 'Dispute reason is required'],
      enum: ['cheating', 'connection_issue', 'rule_violation', 'incorrect_result', 'other']
    },
    description: {
      type: String,
      required: [true, 'Dispute description is required'],
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters']
    },
    evidence: [{
      type: String // URLs to evidence files
    }],
    status: {
      type: String,
      enum: ['pending', 'investigating', 'resolved', 'rejected'],
      default: 'pending'
    },
    resolution: {
      type: String,
      trim: true
    },
    resolvedBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    },
    resolvedAt: {
      type: Date
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],

  // Chat Messages
  chat: [{
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true,
      maxlength: [500, 'Message cannot exceed 500 characters']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    isSystemMessage: {
      type: Boolean,
      default: false
    }
  }],

  // Settings
  settings: {
    allowSpectators: {
      type: Boolean,
      default: true
    },
    autoStart: {
      type: Boolean,
      default: false
    },
    maxDuration: {
      type: Number, // in minutes
      default: 30
    },
    overtimeEnabled: {
      type: Boolean,
      default: false
    },
    overtimeDuration: {
      type: Number, // in minutes
      default: 5
    }
  },

  // Next Match (for bracket progression)
  nextMatch: {
    type: mongoose.Schema.ObjectId,
    ref: 'Match'
  },
  nextMatchPosition: {
    type: String,
    enum: ['player1', 'player2']
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
matchSchema.index({ tournament: 1, round: 1 });
matchSchema.index({ status: 1 });
matchSchema.index({ scheduledAt: 1 });
matchSchema.index({ 'participants.user': 1 });
matchSchema.index({ winner: 1 });
matchSchema.index({ moderator: 1 });
matchSchema.index({ createdAt: -1 });

// Virtual for match duration in minutes
matchSchema.virtual('durationMinutes').get(function() {
  return Math.round(this.duration / 60);
});

// Virtual for participant count
matchSchema.virtual('participantCount').get(function() {
  return this.participants.length;
});

// Virtual for ready participants count
matchSchema.virtual('readyParticipants').get(function() {
  return this.participants.filter(p => p.status === 'ready').length;
});

// Virtual for all participants ready
matchSchema.virtual('allParticipantsReady').get(function() {
  return this.participants.length > 0 && this.participants.every(p => p.status === 'ready');
});

// Pre-save middleware
matchSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Calculate duration if match has ended
  if (this.startedAt && this.endedAt) {
    this.duration = Math.round((this.endedAt - this.startedAt) / 1000);
  }
  
  next();
});

// Method to start match
matchSchema.methods.startMatch = function() {
  if (this.status !== 'ready') {
    throw new Error('Match is not ready to start');
  }
  
  if (!this.allParticipantsReady) {
    throw new Error('Not all participants are ready');
  }
  
  this.status = 'ongoing';
  this.startedAt = new Date();
  
  // Add system message
  this.chat.push({
    user: this.participants[0].user, // Use first participant as system user
    message: 'Match has started!',
    isSystemMessage: true
  });
  
  return this.save();
};

// Method to end match
matchSchema.methods.endMatch = function(winnerId, result, scores = []) {
  if (this.status !== 'ongoing') {
    throw new Error('Match is not ongoing');
  }
  
  this.status = 'completed';
  this.endedAt = new Date();
  this.winner = winnerId;
  this.result = result;
  
  if (scores.length > 0) {
    this.score = scores;
  }
  
  // Add system message
  this.chat.push({
    user: this.participants[0].user,
    message: `Match completed! Winner: ${winnerId ? 'Player' : 'Draw'}`,
    isSystemMessage: true
  });
  
  return this.save();
};

// Method to add participant
matchSchema.methods.addParticipant = function(userId, teamName = null) {
  const existingParticipant = this.participants.find(p => p.user.toString() === userId.toString());
  
  if (existingParticipant) {
    throw new Error('User is already in this match');
  }
  
  this.participants.push({
    user: userId,
    teamName: teamName,
    joinedAt: new Date()
  });
  
  return this.save();
};

// Method to set participant ready
matchSchema.methods.setParticipantReady = function(userId, ready = true) {
  const participant = this.participants.find(p => p.user.toString() === userId.toString());
  
  if (!participant) {
    throw new Error('User is not in this match');
  }
  
  participant.status = ready ? 'ready' : 'not_ready';
  
  // Check if all participants are ready and update match status
  if (this.allParticipantsReady && this.status === 'scheduled') {
    this.status = 'ready';
  }
  
  return this.save();
};

// Method to add chat message
matchSchema.methods.addChatMessage = function(userId, message) {
  this.chat.push({
    user: userId,
    message: message
  });
  
  return this.save();
};

// Method to report dispute
matchSchema.methods.reportDispute = function(userId, reason, description, evidence = []) {
  this.disputes.push({
    reportedBy: userId,
    reason: reason,
    description: description,
    evidence: evidence
  });
  
  this.status = 'disputed';
  
  return this.save();
};

module.exports = mongoose.model('Match', matchSchema);
