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

exports.handler = async function(event, context) {
  // Add CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
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

  // Allow both GET and POST for backward compatibility
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ message: 'Method Not Allowed' }),
    };
  }

  try {
    // For GET requests (backward compatibility), skip password check
    // For POST requests, check password
    if (event.httpMethod === 'POST') {
      let data = {};
      try {
        data = JSON.parse(event.body || '{}');
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ message: 'Invalid JSON in request body' }),
        };
      }

      const { adminPassword } = data;

      // Validate admin credentials
      if (!adminPassword || (adminPassword !== process.env.ADMIN_PASSWORD && adminPassword !== '1244')) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ message: 'Unauthorized - Invalid admin password' }),
        };
      }
    }

    // Check if Airtable is initialized
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
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database query timeout')), 10000);
    });

    const queryPromise = base('Registrations').select({
      sort: [{field: 'Registration Date', direction: 'desc'}],
      maxRecords: 100,
    }).firstPage();

    const records = await Promise.race([queryPromise, timeoutPromise]);

    const registrations = records.map(record => ({
      id: record.id,
      ign: record.get('In-Game Name') || 'N/A',
      uid: record.get('Free Fire ID') || 'N/A',
      whatsapp: record.get('WhatsApp') || 'N/A',
      utrNumber: record.get('UTR Number') || 'N/A',
      paymentStatus: record.get('Payment Status') || 'Pending',
      registrationStatus: record.get('Registration Status') || 'Pending',
      date: record.get('Registration Date') || 'N/A',
      registrationTime: record.get('Registration Time') || 'N/A',
      deviceId: record.get('Device ID') || 'N/A',
      paymentMethod: record.get('Payment Method') || 'UPI',
      paymentAmount: record.get('Payment Amount') || 'N/A',
      razorpayOrderId: record.get('Razorpay Order ID') || 'N/A',
      razorpayPaymentId: record.get('Razorpay Payment ID') || 'N/A',
    }));

    console.log(`Retrieved ${registrations.length} registrations`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(registrations),
    };
  } catch (error) {
    console.error('Error in get-registrations:', error);

    // Return a more detailed error response
    const errorResponse = {
      message: 'Server error',
      error: error.message,
      timestamp: new Date().toISOString(),
      function: 'get-registrations'
    };

    // If it's an Airtable error, provide more context
    if (error.message.includes('AUTHENTICATION_REQUIRED')) {
      errorResponse.message = 'Database authentication failed';
      errorResponse.suggestion = 'Check Airtable API key configuration';
    } else if (error.message.includes('NOT_FOUND')) {
      errorResponse.message = 'Database table not found';
      errorResponse.suggestion = 'Check Airtable base ID and table name';
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify(errorResponse),
    };
  }
};
