const express = require('express');
const { body, validationResult } = require('express-validator');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const Payment = require('../models/Payment');
const Tournament = require('../models/Tournament');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const logger = require('../utils/logger');
const { generateReceipt } = require('../utils/receiptGenerator');

const router = express.Router();

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// @desc    Create Razorpay order
// @route   POST /api/v1/payments/create-order
// @access  Private
router.post('/create-order', protect, [
  body('tournamentId').isMongoId().withMessage('Invalid tournament ID'),
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be greater than 0'),
  body('currency').optional().isIn(['INR', 'USD', 'EUR']).withMessage('Invalid currency')
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

    const { tournamentId, amount, currency = 'INR' } = req.body;

    // Verify tournament exists and user can register
    const tournament = await Tournament.findById(tournamentId);
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

    // Verify amount matches tournament entry fee
    if (amount !== tournament.entryFee) {
      return res.status(400).json({
        success: false,
        error: 'Amount does not match tournament entry fee'
      });
    }

    // Create payment record
    const payment = await Payment.create({
      user: req.user._id,
      tournament: tournamentId,
      amount: amount,
      currency: currency,
      paymentGateway: 'razorpay',
      paymentMethod: 'card', // Will be updated after payment
      status: 'pending',
      deviceInfo: {
        userAgent: req.get('User-Agent'),
        ipAddress: req.ip,
        deviceId: req.body.deviceId || req.user.deviceId
      }
    });

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(amount * 100), // Convert to paise
      currency: currency,
      receipt: `tournament_${tournamentId}_${req.user._id}_${Date.now()}`,
      notes: {
        userId: req.user._id.toString(),
        tournamentId: tournamentId,
        paymentId: payment._id.toString(),
        username: req.user.username,
        tournamentTitle: tournament.title
      }
    });

    // Update payment with Razorpay order details
    payment.razorpay.orderId = razorpayOrder.id;
    payment.razorpay.receipt = razorpayOrder.receipt;
    payment.referenceId = razorpayOrder.id;
    await payment.save();

    logger.info(`Razorpay order created: ${razorpayOrder.id} for user ${req.user.username}`);

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: {
        orderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        paymentId: payment._id,
        keyId: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    logger.error('Error creating Razorpay order:', error);
    next(error);
  }
});

// @desc    Verify Razorpay payment for tournament registration
// @route   POST /api/v1/payments/verify-payment
// @access  Public (for tournament registrations)
router.post('/verify-payment', [
  body('razorpay_order_id').notEmpty().withMessage('Razorpay order ID is required'),
  body('razorpay_payment_id').notEmpty().withMessage('Razorpay payment ID is required'),
  body('razorpay_signature').notEmpty().withMessage('Razorpay signature is required'),
  body('registration_data').isObject().withMessage('Registration data is required')
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

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, registration_data } = req.body;

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: 'Payment verification failed - Invalid signature'
      });
    }

    // Find user by device ID from registration data
    const user = await User.findOne({ deviceId: registration_data.deviceId });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Find the default tournament
    const tournament = await Tournament.findOne({
      title: 'SR Bird 1v1 Free Fire Tournament',
      status: { $in: ['registration_open', 'upcoming'] }
    });

    if (!tournament) {
      return res.status(404).json({
        success: false,
        error: 'Tournament not found'
      });
    }

    // Fetch payment details from Razorpay
    let razorpayPayment;
    try {
      razorpayPayment = await razorpay.payments.fetch(razorpay_payment_id);
    } catch (error) {
      logger.error('Error fetching Razorpay payment:', error);

      return res.status(500).json({
        success: false,
        error: 'Failed to verify payment with gateway'
      });
    }

    // Check payment status
    if (razorpayPayment.status !== 'captured') {
      return res.status(400).json({
        success: false,
        error: 'Payment was not successful'
      });
    }

    // Update participant payment status in tournament
    const participant = tournament.participants.find(p => p.user.toString() === user._id.toString());
    if (participant) {
      participant.paymentStatus = 'completed';
      participant.status = 'confirmed';
      participant.paymentId = razorpay_payment_id;
      await tournament.save();
    } else {
      // If participant not found, add them to tournament
      try {
        await tournament.addParticipant(user._id, razorpay_payment_id);
        const newParticipant = tournament.participants.find(p => p.user.toString() === user._id.toString());
        if (newParticipant) {
          newParticipant.paymentStatus = 'completed';
          newParticipant.status = 'confirmed';
          await tournament.save();
        }
      } catch (error) {
        logger.error('Error adding participant to tournament:', error);
      }
    }

    logger.info(`Payment verified successfully: ${razorpay_payment_id} for user ${user.username}`);

    res.status(200).json({
      success: true,
      message: 'Payment verified and tournament registration completed',
      razorpay_payment_id: razorpay_payment_id,
      data: {
        paymentId: razorpay_payment_id,
        transactionId: razorpay_payment_id,
        amount: registration_data.amount / 100, // Convert from paise to rupees
        tournament: {
          id: tournament._id,
          title: tournament.title
        },
        user: {
          id: user._id,
          username: user.username,
          ign: user.gaming.freeFireName,
          uid: user.gaming.freeFireId
        }
      }
    });
  } catch (error) {
    logger.error('Error verifying payment:', error);
    next(error);
  }
});

// @desc    Get payment details
// @route   GET /api/v1/payments/:id
// @access  Private
router.get('/:id', protect, async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('user', 'username email')
      .populate('tournament', 'title gameType tournamentType');

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    // Check if user can view this payment
    if (payment.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to view this payment'
      });
    }

    res.status(200).json({
      success: true,
      data: { payment }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get user's payment history
// @route   GET /api/v1/payments/user/history
// @access  Private
router.get('/user/history', protect, async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const payments = await Payment.find({ user: req.user._id })
      .populate('tournament', 'title gameType tournamentType')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Payment.countDocuments({ user: req.user._id });

    res.status(200).json({
      success: true,
      data: {
        payments,
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

// @desc    Download receipt
// @route   GET /api/v1/payments/:id/receipt
// @access  Private
router.get('/:id/receipt', protect, async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('user', 'username email')
      .populate('tournament', 'title');

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found'
      });
    }

    // Check if user can download this receipt
    if (payment.user._id.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to download this receipt'
      });
    }

    if (payment.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Receipt not available for incomplete payments'
      });
    }

    // Generate receipt if not exists
    let receiptUrl = payment.receipt.receiptUrl;
    
    if (!receiptUrl) {
      try {
        receiptUrl = await generateReceipt({
          paymentId: payment._id,
          userName: payment.user.username,
          userEmail: payment.user.email,
          tournamentTitle: payment.tournament.title,
          amount: payment.amount,
          currency: payment.currency,
          paymentDate: payment.completedAt,
          transactionId: payment.transactionId
        });
        
        payment.receipt.receiptUrl = receiptUrl;
        await payment.save();
      } catch (error) {
        logger.error('Error generating receipt:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to generate receipt'
        });
      }
    }

    res.status(200).json({
      success: true,
      data: {
        receiptUrl: receiptUrl,
        receiptNumber: payment.receipt.receiptNumber
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
