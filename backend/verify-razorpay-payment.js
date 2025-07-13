const crypto = require('crypto');
const Airtable = require('airtable');

// Initialize Airtable with error handling
let base;
try {
  if (process.env.AIRTABLE_API_KEY && process.env.AIRTABLE_BASE_ID) {
    base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
  }
} catch (error) {
  console.error('Airtable initialization error:', error);
}

// Function to verify Razorpay payment signature
function verifyPaymentSignature(orderId, paymentId, signature, secret) {
  const body = orderId + '|' + paymentId;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body.toString())
    .digest('hex');
  
  return expectedSignature === signature;
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
    // Check if required services are initialized
    if (!base) {
      console.error('Airtable not initialized - missing environment variables');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          message: 'Database connection error',
          error: 'Airtable configuration missing'
        }),
      };
    }

    if (!process.env.RAZORPAY_KEY_SECRET) {
      console.error('Razorpay key secret not found');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          message: 'Payment verification configuration error',
          error: 'Razorpay secret key missing'
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
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      registration_data 
    } = data;

    // Validate required fields
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          message: 'Missing required payment verification fields' 
        }),
      };
    }

    // Verify payment signature
    const isValidSignature = verifyPaymentSignature(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      process.env.RAZORPAY_KEY_SECRET
    );

    if (!isValidSignature) {
      console.error('Invalid payment signature:', {
        order_id: razorpay_order_id,
        payment_id: razorpay_payment_id
      });
      
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Payment verification failed',
          error: 'Invalid payment signature'
        }),
      };
    }

    console.log('Payment signature verified successfully:', razorpay_payment_id);

    // Update registration in Airtable if registration_data is provided
    if (registration_data) {
      try {

        const registrationRecord = {
          'In-Game Name': registration_data.ign || 'N/A',
          'Free Fire ID': registration_data.uid || 'N/A',
          'WhatsApp': registration_data.whatsapp || 'N/A',
          'Payment Status': 'Paid',
          'Registration Status': 'Confirmed',
          'Payment Method': 'Razorpay',
          'Razorpay Order ID': razorpay_order_id,
          'Razorpay Payment ID': razorpay_payment_id,
          'Registration Date': new Date().toISOString().split('T')[0],
          'Registration Time': new Date().toLocaleTimeString(),
          'Device ID': registration_data.deviceId || 'N/A',
          'Payment Amount': registration_data.amount || 0
        };

        const createdRecord = await base('Registrations').create([
          { fields: registrationRecord }
        ]);

        console.log('Registration record created:', createdRecord[0].id);

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'Payment verified and registration completed successfully',
            payment_id: razorpay_payment_id,
            order_id: razorpay_order_id,
            registration_id: createdRecord[0].id,
            registration_status: 'Confirmed'
          }),
        };

      } catch (airtableError) {
        console.error('Error creating registration record:', airtableError);
        
        // Payment is verified but registration failed
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'Payment verified but registration update failed',
            payment_id: razorpay_payment_id,
            order_id: razorpay_order_id,
            warning: 'Please contact support for registration confirmation',
            error: airtableError.message
          }),
        };
      }
    }

    // Payment verified but no registration data provided
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Payment verified successfully',
        payment_id: razorpay_payment_id,
        order_id: razorpay_order_id
      }),
    };

  } catch (error) {
    console.error('Error in payment verification:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Payment verification failed',
        message: error.message,
        timestamp: new Date().toISOString()
      }),
    };
  }
};
