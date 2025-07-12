exports.handler = async function(event, context) {
  // Add CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ message: 'Method Not Allowed' }),
    };
  }

  try {
    // Check if Razorpay key ID is configured
    if (!process.env.RAZORPAY_KEY_ID) {
      console.error('Razorpay key ID not configured');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Payment system configuration error',
          message: 'Razorpay key not configured'
        }),
      };
    }

    // Return only the public key ID (never return the secret key)
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        keyId: process.env.RAZORPAY_KEY_ID,
        success: true
      }),
    };

  } catch (error) {
    console.error('Error fetching Razorpay key:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: 'Failed to fetch payment configuration'
      }),
    };
  }
};
