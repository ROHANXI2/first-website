const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  // Basic Information
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'User is required']
  },
  tournament: {
    type: mongoose.Schema.ObjectId,
    ref: 'Tournament',
    required: [true, 'Tournament is required']
  },
  
  // Payment Details
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0, 'Amount cannot be negative']
  },
  currency: {
    type: String,
    required: [true, 'Currency is required'],
    enum: ['INR', 'USD', 'EUR'],
    default: 'INR'
  },
  
  // Payment Gateway Information
  paymentGateway: {
    type: String,
    required: [true, 'Payment gateway is required'],
    enum: ['razorpay', 'stripe', 'paypal', 'manual'],
    default: 'razorpay'
  },
  
  // Razorpay specific fields
  razorpay: {
    orderId: {
      type: String,
      sparse: true,
      index: true
    },
    paymentId: {
      type: String,
      sparse: true,
      index: true
    },
    signature: {
      type: String
    },
    receipt: {
      type: String
    }
  },
  
  // Transaction Details
  transactionId: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  referenceId: {
    type: String,
    index: true
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded', 'disputed'],
    default: 'pending',
    index: true
  },
  
  // Payment Method
  paymentMethod: {
    type: String,
    enum: ['card', 'netbanking', 'wallet', 'upi', 'bank_transfer', 'cash'],
    required: [true, 'Payment method is required']
  },
  
  // Timestamps
  initiatedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  },
  failedAt: {
    type: Date
  },
  refundedAt: {
    type: Date
  },
  
  // Failure Information
  failureReason: {
    type: String,
    trim: true
  },
  errorCode: {
    type: String,
    trim: true
  },
  errorDescription: {
    type: String,
    trim: true
  },
  
  // Refund Information
  refund: {
    amount: {
      type: Number,
      min: [0, 'Refund amount cannot be negative']
    },
    reason: {
      type: String,
      trim: true
    },
    refundId: {
      type: String
    },
    processedAt: {
      type: Date
    },
    processedBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    }
  },
  
  // Receipt Information
  receipt: {
    receiptNumber: {
      type: String,
      unique: true,
      sparse: true
    },
    receiptUrl: {
      type: String
    },
    generatedAt: {
      type: Date
    }
  },
  
  // Additional Information
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  },
  
  // Device and Location Info
  deviceInfo: {
    userAgent: {
      type: String
    },
    ipAddress: {
      type: String
    },
    deviceId: {
      type: String
    }
  },
  
  // Webhook Information
  webhookEvents: [{
    event: {
      type: String,
      required: true
    },
    data: {
      type: mongoose.Schema.Types.Mixed
    },
    receivedAt: {
      type: Date,
      default: Date.now
    },
    processed: {
      type: Boolean,
      default: false
    }
  }],
  
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
paymentSchema.index({ user: 1, tournament: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ paymentGateway: 1 });
paymentSchema.index({ paymentMethod: 1 });
paymentSchema.index({ 'razorpay.orderId': 1 });
paymentSchema.index({ 'razorpay.paymentId': 1 });
paymentSchema.index({ transactionId: 1 });
paymentSchema.index({ initiatedAt: -1 });
paymentSchema.index({ completedAt: -1 });
paymentSchema.index({ createdAt: -1 });

// Virtual for payment duration
paymentSchema.virtual('processingDuration').get(function() {
  if (this.completedAt && this.initiatedAt) {
    return Math.round((this.completedAt - this.initiatedAt) / 1000); // in seconds
  }
  return null;
});

// Virtual for is successful
paymentSchema.virtual('isSuccessful').get(function() {
  return this.status === 'completed';
});

// Virtual for is failed
paymentSchema.virtual('isFailed').get(function() {
  return ['failed', 'cancelled'].includes(this.status);
});

// Virtual for is refunded
paymentSchema.virtual('isRefunded').get(function() {
  return this.status === 'refunded';
});

// Virtual for formatted amount
paymentSchema.virtual('formattedAmount').get(function() {
  const symbols = {
    'INR': '₹',
    'USD': '$',
    'EUR': '€'
  };
  
  const symbol = symbols[this.currency] || this.currency;
  return `${symbol}${this.amount.toFixed(2)}`;
});

// Pre-save middleware
paymentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Generate receipt number if payment is completed and receipt doesn't exist
  if (this.status === 'completed' && !this.receipt.receiptNumber) {
    this.receipt.receiptNumber = `RCP-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    this.receipt.generatedAt = new Date();
  }
  
  // Set completion timestamp
  if (this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }
  
  // Set failure timestamp
  if (['failed', 'cancelled'].includes(this.status) && !this.failedAt) {
    this.failedAt = new Date();
  }
  
  // Set refund timestamp
  if (this.status === 'refunded' && !this.refundedAt) {
    this.refundedAt = new Date();
  }
  
  next();
});

// Method to mark payment as completed
paymentSchema.methods.markCompleted = function(transactionId, paymentId = null) {
  this.status = 'completed';
  this.transactionId = transactionId;
  this.completedAt = new Date();
  
  if (paymentId && this.paymentGateway === 'razorpay') {
    this.razorpay.paymentId = paymentId;
  }
  
  return this.save();
};

// Method to mark payment as failed
paymentSchema.methods.markFailed = function(reason, errorCode = null, errorDescription = null) {
  this.status = 'failed';
  this.failureReason = reason;
  this.errorCode = errorCode;
  this.errorDescription = errorDescription;
  this.failedAt = new Date();
  
  return this.save();
};

// Method to process refund
paymentSchema.methods.processRefund = function(refundAmount, reason, refundId, processedBy) {
  if (this.status !== 'completed') {
    throw new Error('Can only refund completed payments');
  }
  
  if (refundAmount > this.amount) {
    throw new Error('Refund amount cannot exceed payment amount');
  }
  
  this.status = 'refunded';
  this.refund = {
    amount: refundAmount,
    reason: reason,
    refundId: refundId,
    processedAt: new Date(),
    processedBy: processedBy
  };
  this.refundedAt = new Date();
  
  return this.save();
};

// Method to add webhook event
paymentSchema.methods.addWebhookEvent = function(event, data) {
  this.webhookEvents.push({
    event: event,
    data: data,
    receivedAt: new Date(),
    processed: false
  });
  
  return this.save();
};

// Method to mark webhook event as processed
paymentSchema.methods.markWebhookProcessed = function(eventId) {
  const event = this.webhookEvents.id(eventId);
  if (event) {
    event.processed = true;
  }
  
  return this.save();
};

// Static method to generate unique transaction ID
paymentSchema.statics.generateTransactionId = function() {
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substr(2, 9).toUpperCase();
  return `TXN-${timestamp}-${random}`;
};

// Static method to find payment by Razorpay order ID
paymentSchema.statics.findByRazorpayOrderId = function(orderId) {
  return this.findOne({ 'razorpay.orderId': orderId });
};

// Static method to find payment by Razorpay payment ID
paymentSchema.statics.findByRazorpayPaymentId = function(paymentId) {
  return this.findOne({ 'razorpay.paymentId': paymentId });
};

// Static method to get payment statistics
paymentSchema.statics.getStats = function(startDate, endDate) {
  const matchStage = {
    createdAt: {
      $gte: startDate,
      $lte: endDate
    }
  };
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    },
    {
      $group: {
        _id: null,
        stats: {
          $push: {
            status: '$_id',
            count: '$count',
            totalAmount: '$totalAmount'
          }
        },
        totalPayments: { $sum: '$count' },
        totalRevenue: {
          $sum: {
            $cond: [
              { $eq: ['$_id', 'completed'] },
              '$totalAmount',
              0
            ]
          }
        }
      }
    }
  ]);
};

module.exports = mongoose.model('Payment', paymentSchema);
