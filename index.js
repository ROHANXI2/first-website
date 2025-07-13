const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Helper function to wrap Netlify functions for Express
function wrapNetlifyFunction(netlifyFunction) {
  return async (req, res) => {
    try {
      // Create Netlify-style event object
      const event = {
        httpMethod: req.method,
        headers: req.headers,
        body: JSON.stringify(req.body),
        queryStringParameters: req.query
      };

      // Call the Netlify function
      const result = await netlifyFunction.handler(event);

      // Send response
      res.status(result.statusCode || 200);
      
      if (result.headers) {
        Object.keys(result.headers).forEach(key => {
          res.set(key, result.headers[key]);
        });
      }

      if (result.body) {
        try {
          const parsedBody = JSON.parse(result.body);
          res.json(parsedBody);
        } catch {
          res.send(result.body);
        }
      } else {
        res.end();
      }
    } catch (error) {
      console.error('Function error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

// Import Netlify functions
let createRazorpayOrder, generateReceipt, generateToken, getRazorpayKey,
    getRegistrations, razorpayWebhook, verifyRazorpayPayment, checkBan;

try {
  createRazorpayOrder = require('./create-razorpay-order');
  generateReceipt = require('./generate-receipt');
  generateToken = require('./generate-token');
  getRazorpayKey = require('./get-razorpay-key');
  getRegistrations = require('./get-registrations');
  razorpayWebhook = require('./razorpay-webhook');
  verifyRazorpayPayment = require('./verify-razorpay-payment');

  // Ban check function
  try {
    checkBan = require('./check-ban');
  } catch (e) {
    console.log('Check ban function not found, skipping...');
  }
} catch (error) {
  console.error('Error loading functions:', error);
}

// API Routes
if (createRazorpayOrder) {
  app.all('/api/create-razorpay-order', wrapNetlifyFunction(createRazorpayOrder));
}
if (generateReceipt) {
  app.all('/api/generate-receipt', wrapNetlifyFunction(generateReceipt));
}
if (generateToken) {
  app.all('/api/generate-token', wrapNetlifyFunction(generateToken));
}
if (getRazorpayKey) {
  app.all('/api/get-razorpay-key', wrapNetlifyFunction(getRazorpayKey));
}
if (getRegistrations) {
  app.all('/api/get-registrations', wrapNetlifyFunction(getRegistrations));
}
if (razorpayWebhook) {
  app.all('/api/razorpay-webhook', wrapNetlifyFunction(razorpayWebhook));
}
if (verifyRazorpayPayment) {
  app.all('/api/verify-razorpay-payment', wrapNetlifyFunction(verifyRazorpayPayment));
}

// Ban check route
if (checkBan) {
  app.all('/api/check-ban', wrapNetlifyFunction(checkBan));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'FF Tournament Backend is running',
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'FF Tournament Backend API',
    endpoints: [
      '/health',
      '/api/create-razorpay-order',
      '/api/generate-receipt',
      '/api/generate-token',
      '/api/get-razorpay-key',
      '/api/get-registrations',
      '/api/razorpay-webhook',
      '/api/verify-razorpay-payment',
      '/api/ban-player',
      '/api/check-ban',
      '/api/get-bans',
      '/api/unban-player'
    ]
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
