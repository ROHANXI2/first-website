const express = require('express');
const crypto = require('crypto');
const Payment = require('../models/Payment');
const Tournament = require('../models/Tournament');
const User = require('../models/User');
const logger = require('../utils/logger');

const router = express.Router();

// Middleware to verify Razorpay webhook signature
const verifyRazorpaySignature = (req, res, next) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const body = JSON.stringify(req.body);
    
    if (!signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing signature header'
      });
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest('hex');

    if (signature !== expectedSignature) {
      logger.warn('Invalid webhook signature received');
      return res.status(400).json({
        success: false,
        error: 'Invalid signature'
      });
    }

    next();
  } catch (error) {
    logger.error('Error verifying webhook signature:', error);
    return res.status(500).json({
      success: false,
      error: 'Signature verification failed'
    });
  }
};

// @desc    Handle Razorpay webhooks
// @route   POST /api/v1/webhooks/razorpay
// @access  Public (but verified)
router.post('/razorpay', express.raw({ type: 'application/json' }), verifyRazorpaySignature, async (req, res) => {
  try {
    const event = req.body;
    const { entity, event: eventType } = event;

    logger.info(`Received Razorpay webhook: ${eventType}`);

    switch (eventType) {
      case 'payment.captured':
        await handlePaymentCaptured(entity);
        break;
        
      case 'payment.failed':
        await handlePaymentFailed(entity);
        break;
        
      case 'order.paid':
        await handleOrderPaid(entity);
        break;
        
      case 'refund.created':
        await handleRefundCreated(entity);
        break;
        
      case 'refund.processed':
        await handleRefundProcessed(entity);
        break;
        
      default:
        logger.info(`Unhandled webhook event: ${eventType}`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error processing webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Webhook processing failed'
    });
  }
});

// Handle payment captured event
const handlePaymentCaptured = async (paymentEntity) => {
  try {
    const payment = await Payment.findOne({
      'razorpay.orderId': paymentEntity.order_id
    }).populate('tournament user');

    if (!payment) {
      logger.warn(`Payment not found for order: ${paymentEntity.order_id}`);
      return;
    }

    // Add webhook event to payment
    await payment.addWebhookEvent('payment.captured', paymentEntity);

    // Update payment status if not already completed
    if (payment.status !== 'completed') {
      await payment.markCompleted(paymentEntity.id, paymentEntity.id);
      
      // Add user to tournament if not already added
      const tournament = await Tournament.findById(payment.tournament._id);
      const existingParticipant = tournament.participants.find(
        p => p.user.toString() === payment.user._id.toString()
      );

      if (!existingParticipant) {
        await tournament.addParticipant(payment.user._id, payment._id.toString());
      } else if (existingParticipant.paymentStatus !== 'completed') {
        existingParticipant.paymentStatus = 'completed';
        existingParticipant.paymentId = payment._id.toString();
        await tournament.save();
      }

      logger.info(`Payment captured via webhook: ${paymentEntity.id}`);
    }
  } catch (error) {
    logger.error('Error handling payment captured webhook:', error);
  }
};

// Handle payment failed event
const handlePaymentFailed = async (paymentEntity) => {
  try {
    const payment = await Payment.findOne({
      'razorpay.orderId': paymentEntity.order_id
    });

    if (!payment) {
      logger.warn(`Payment not found for order: ${paymentEntity.order_id}`);
      return;
    }

    // Add webhook event to payment
    await payment.addWebhookEvent('payment.failed', paymentEntity);

    // Update payment status
    const errorDescription = paymentEntity.error_description || 'Payment failed';
    const errorCode = paymentEntity.error_code || 'PAYMENT_FAILED';
    
    await payment.markFailed(errorDescription, errorCode, paymentEntity.error_reason);

    logger.info(`Payment failed via webhook: ${paymentEntity.id}`);
  } catch (error) {
    logger.error('Error handling payment failed webhook:', error);
  }
};

// Handle order paid event
const handleOrderPaid = async (orderEntity) => {
  try {
    const payment = await Payment.findOne({
      'razorpay.orderId': orderEntity.id
    });

    if (!payment) {
      logger.warn(`Payment not found for order: ${orderEntity.id}`);
      return;
    }

    // Add webhook event to payment
    await payment.addWebhookEvent('order.paid', orderEntity);

    logger.info(`Order paid via webhook: ${orderEntity.id}`);
  } catch (error) {
    logger.error('Error handling order paid webhook:', error);
  }
};

// Handle refund created event
const handleRefundCreated = async (refundEntity) => {
  try {
    const payment = await Payment.findOne({
      'razorpay.paymentId': refundEntity.payment_id
    });

    if (!payment) {
      logger.warn(`Payment not found for refund: ${refundEntity.id}`);
      return;
    }

    // Add webhook event to payment
    await payment.addWebhookEvent('refund.created', refundEntity);

    // Update payment status to refunded if full refund
    if (refundEntity.amount === payment.amount * 100) { // Razorpay amount is in paise
      payment.status = 'refunded';
      payment.refund = {
        amount: refundEntity.amount / 100,
        reason: 'Refund initiated',
        refundId: refundEntity.id,
        processedAt: new Date()
      };
      await payment.save();
    }

    logger.info(`Refund created via webhook: ${refundEntity.id}`);
  } catch (error) {
    logger.error('Error handling refund created webhook:', error);
  }
};

// Handle refund processed event
const handleRefundProcessed = async (refundEntity) => {
  try {
    const payment = await Payment.findOne({
      'razorpay.paymentId': refundEntity.payment_id
    });

    if (!payment) {
      logger.warn(`Payment not found for refund: ${refundEntity.id}`);
      return;
    }

    // Add webhook event to payment
    await payment.addWebhookEvent('refund.processed', refundEntity);

    // Update refund status
    if (payment.refund && payment.refund.refundId === refundEntity.id) {
      payment.refund.processedAt = new Date();
      await payment.save();
    }

    logger.info(`Refund processed via webhook: ${refundEntity.id}`);
  } catch (error) {
    logger.error('Error handling refund processed webhook:', error);
  }
};

// @desc    Test webhook endpoint
// @route   POST /api/v1/webhooks/test
// @access  Private/Admin (for testing purposes)
router.post('/test', async (req, res) => {
  try {
    // This endpoint can be used for testing webhook functionality
    logger.info('Test webhook received:', req.body);
    
    res.status(200).json({
      success: true,
      message: 'Test webhook received',
      data: req.body
    });
  } catch (error) {
    logger.error('Error processing test webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Test webhook processing failed'
    });
  }
});

// @desc    Get webhook logs (admin only)
// @route   GET /api/v1/webhooks/logs
// @access  Private/Admin
router.get('/logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Get payments with webhook events
    const payments = await Payment.find({
      'webhookEvents.0': { $exists: true }
    })
    .select('razorpay.orderId razorpay.paymentId status webhookEvents createdAt')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

    const total = await Payment.countDocuments({
      'webhookEvents.0': { $exists: true }
    });

    res.status(200).json({
      success: true,
      data: {
        webhookLogs: payments,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching webhook logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch webhook logs'
    });
  }
});

module.exports = router;
