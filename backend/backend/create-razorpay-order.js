const Razorpay = require('razorpay');
const crypto = require('crypto');

// Initialize Razorpay instance
let razorpay;
try {
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
} catch (error) {
  console.error('Razorpay initialization error:', error);
}

exports.handler = async function(event, context) {
  // Add CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ message: 'Method Not Allowed' }),
    };
  }

  try {
    // Check if Razorpay is initialized
    if (!razorpay) {
      console.error('Razorpay not initialized - missing environment variables');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          message: 'Payment gateway configuration error',
          error: 'Razorpay configuration missing'
        }),
      };
    }

    // Validate request body
    if (!event.body || typeof event.body !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid request body' }),
      };
    }

    const data = JSON.parse(event.body);
    const { amount, currency = 'INR', receipt, notes = {} } = data;

    // Validate required fields
    if (!amount || !receipt) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          message: 'Missing required fields: amount and receipt' 
        }),
      };
    }

    // Validate amount (should be in paise for INR)
    if (typeof amount !== 'number' || amount <= 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          message: 'Invalid amount. Amount should be a positive number in paise.' 
        }),
      };
    }

    // Create order options
    const orderOptions = {
      amount: amount, // Amount in paise
      currency: currency,
      receipt: receipt,
      notes: {
        tournament_registration: 'true',
        ...notes
      }
    };

    console.log('Creating Razorpay order with options:', orderOptions);

    // Create order with Razorpay
    const order = await razorpay.orders.create(orderOptions);

    console.log('Razorpay order created successfully:', order.id);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        order_id: order.id,
        amount: order.amount,
        currency: order.currency,
        receipt: order.receipt,
        status: order.status,
        created_at: order.created_at,
        notes: order.notes
      }),
    };

  } catch (error) {
    console.error('Error creating Razorpay order:', error);

    // Handle specific Razorpay errors
    let errorMessage = 'Failed to create payment order';
    let statusCode = 500;

    if (error.statusCode) {
      statusCode = error.statusCode;
      errorMessage = error.error?.description || error.message;
    }

    return {
      statusCode: statusCode,
      headers,
      body: JSON.stringify({
        success: false,
        error: errorMessage,
        message: 'Payment order creation failed',
        timestamp: new Date().toISOString()
      }),
    };
  }
};
