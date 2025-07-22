const mongoose = require('mongoose');

const tournamentSchema = new mongoose.Schema({
  // Basic Information
  title: {
    type: String,
    required: [true, 'Tournament title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Tournament description is required'],
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  gameType: {
    type: String,
    required: [true, 'Game type is required'],
    enum: ['Free Fire', 'PUBG Mobile', 'Call of Duty Mobile', 'Valorant Mobile'],
    default: 'Free Fire'
  },
  tournamentType: {
    type: String,
    required: [true, 'Tournament type is required'],
    enum: ['1v1', '2v2', '4v4', 'Squad', 'Battle Royale', 'Custom'],
    default: '1v1'
  },

  // Tournament Settings
  maxParticipants: {
    type: Number,
    required: [true, 'Maximum participants is required'],
    min: [2, 'Minimum 2 participants required'],
    max: [1000, 'Maximum 1000 participants allowed'],
    default: 64
  },
  entryFee: {
    type: Number,
    required: [true, 'Entry fee is required'],
    min: [0, 'Entry fee cannot be negative'],
    default: 30
  },
  currency: {
    type: String,
    required: [true, 'Currency is required'],
    enum: ['INR', 'USD', 'EUR'],
    default: 'INR'
  },

  // Prize Pool
  prizePool: {
    total: {
      type: Number,
      required: [true, 'Total prize pool is required'],
      min: [0, 'Prize pool cannot be negative']
    },
    distribution: [{
      position: {
        type: Number,
        required: true,
        min: 1
      },
      amount: {
        type: Number,
        required: true,
        min: 0
      },
      percentage: {
        type: Number,
        min: 0,
        max: 100
      }
    }]
  },

  // Schedule
  registrationStart: {
    type: Date,
    required: [true, 'Registration start date is required']
  },
  registrationEnd: {
    type: Date,
    required: [true, 'Registration end date is required']
  },
  tournamentStart: {
    type: Date,
    required: [true, 'Tournament start date is required']
  },
  tournamentEnd: {
    type: Date,
    required: [true, 'Tournament end date is required']
  },

  // Status
  status: {
    type: String,
    enum: ['draft', 'upcoming', 'registration_open', 'registration_closed', 'ongoing', 'completed', 'cancelled'],
    default: 'draft'
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  isFeatured: {
    type: Boolean,
    default: false
  },

  // Rules and Requirements
  rules: [{
    type: String,
    trim: true,
    maxlength: [500, 'Rule cannot exceed 500 characters']
  }],
  requirements: {
    minLevel: {
      type: Number,
      min: [1, 'Minimum level must be at least 1'],
      default: 1
    },
    minRank: {
      type: String,
      enum: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Grandmaster', 'Heroic'],
      default: 'Bronze'
    },
    regions: [{
      type: String,
      trim: true
    }],
    deviceRestrictions: [{
      type: String,
      enum: ['Android', 'iOS', 'PC', 'Console']
    }]
  },

  // Participants
  participants: [{
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: true
    },
    registeredAt: {
      type: Date,
      default: Date.now
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending'
    },
    paymentId: {
      type: String
    },
    status: {
      type: String,
      enum: ['registered', 'confirmed', 'disqualified', 'withdrawn'],
      default: 'registered'
    },
    teamName: {
      type: String,
      trim: true
    },
    seed: {
      type: Number
    }
  }],

  // Tournament Bracket
  bracket: {
    type: {
      type: String,
      enum: ['single_elimination', 'double_elimination', 'round_robin', 'swiss'],
      default: 'single_elimination'
    },
    rounds: [{
      roundNumber: {
        type: Number,
        required: true
      },
      matches: [{
        type: mongoose.Schema.ObjectId,
        ref: 'Match'
      }]
    }]
  },

  // Statistics
  stats: {
    totalRegistrations: {
      type: Number,
      default: 0
    },
    totalRevenue: {
      type: Number,
      default: 0
    },
    completedMatches: {
      type: Number,
      default: 0
    },
    averageMatchDuration: {
      type: Number,
      default: 0
    }
  },

  // Media
  banner: {
    type: String
  },
  images: [{
    type: String
  }],
  streamUrl: {
    type: String,
    trim: true
  },

  // Organization
  organizer: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: true
  },
  moderators: [{
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  }],

  // Settings
  settings: {
    autoStart: {
      type: Boolean,
      default: false
    },
    allowLateRegistration: {
      type: Boolean,
      default: false
    },
    requireApproval: {
      type: Boolean,
      default: false
    },
    showBracket: {
      type: Boolean,
      default: true
    },
    allowSpectators: {
      type: Boolean,
      default: true
    }
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
tournamentSchema.index({ status: 1 });
tournamentSchema.index({ gameType: 1 });
tournamentSchema.index({ tournamentType: 1 });
tournamentSchema.index({ registrationStart: 1, registrationEnd: 1 });
tournamentSchema.index({ tournamentStart: 1 });
tournamentSchema.index({ isPublished: 1 });
tournamentSchema.index({ isFeatured: 1 });
tournamentSchema.index({ organizer: 1 });
tournamentSchema.index({ createdAt: -1 });

// Virtual for current participant count
tournamentSchema.virtual('currentParticipants').get(function() {
  return this.participants.filter(p => p.status === 'registered' || p.status === 'confirmed').length;
});

// Virtual for available spots
tournamentSchema.virtual('availableSpots').get(function() {
  return this.maxParticipants - this.currentParticipants;
});

// Virtual for registration status
tournamentSchema.virtual('registrationStatus').get(function() {
  const now = new Date();
  if (now < this.registrationStart) return 'not_started';
  if (now > this.registrationEnd) return 'closed';
  if (this.currentParticipants >= this.maxParticipants) return 'full';
  return 'open';
});

// Virtual for tournament progress
tournamentSchema.virtual('progress').get(function() {
  if (this.status === 'completed') return 100;
  if (this.status === 'ongoing') {
    const totalMatches = this.bracket.rounds.reduce((total, round) => total + round.matches.length, 0);
    if (totalMatches === 0) return 0;
    return Math.round((this.stats.completedMatches / totalMatches) * 100);
  }
  return 0;
});

// Pre-save middleware
tournamentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Update stats
  this.stats.totalRegistrations = this.participants.length;
  this.stats.totalRevenue = this.participants.filter(p => p.paymentStatus === 'completed').length * this.entryFee;
  
  next();
});

// Method to add participant
tournamentSchema.methods.addParticipant = function(userId, paymentId = null) {
  const existingParticipant = this.participants.find(p => p.user.toString() === userId.toString());
  
  if (existingParticipant) {
    throw new Error('User is already registered for this tournament');
  }
  
  if (this.currentParticipants >= this.maxParticipants) {
    throw new Error('Tournament is full');
  }
  
  this.participants.push({
    user: userId,
    paymentId: paymentId,
    paymentStatus: paymentId ? 'completed' : 'pending'
  });
  
  return this.save();
};

// Method to remove participant
tournamentSchema.methods.removeParticipant = function(userId) {
  this.participants = this.participants.filter(p => p.user.toString() !== userId.toString());
  return this.save();
};

// Method to update tournament status based on dates
tournamentSchema.methods.updateStatus = function() {
  const now = new Date();
  
  if (this.status === 'draft' && this.isPublished) {
    if (now < this.registrationStart) {
      this.status = 'upcoming';
    } else if (now >= this.registrationStart && now <= this.registrationEnd) {
      this.status = 'registration_open';
    } else if (now > this.registrationEnd && now < this.tournamentStart) {
      this.status = 'registration_closed';
    } else if (now >= this.tournamentStart && now <= this.tournamentEnd) {
      this.status = 'ongoing';
    } else if (now > this.tournamentEnd) {
      this.status = 'completed';
    }
  }
  
  return this.save();
};

module.exports = mongoose.model('Tournament', tournamentSchema);
