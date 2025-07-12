const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Import and use API routes
const createRazorpayOrder = require('./create-razorpay-order');
const generateReceipt = require('./generate-receipt');
const generateToken = require('./generate-token');
const getRazorpayKey = require('./get-razorpay-key');
const getRegistrations = require('./get-registrations');
const razorpayWebhook = require('./razorpay-webhook');
const verifyRazorpayPayment = require('./verify-razorpay-payment');

// API Routes
app.use('/api/create-razorpay-order', createRazorpayOrder);
app.use('/api/generate-receipt', generateReceipt);
app.use('/api/generate-token', generateToken);
app.use('/api/get-razorpay-key', getRazorpayKey);
app.use('/api/get-registrations', getRegistrations);
app.use('/api/razorpay-webhook', razorpayWebhook);
app.use('/api/verify-razorpay-payment', verifyRazorpayPayment);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'FF Tournament Backend is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
