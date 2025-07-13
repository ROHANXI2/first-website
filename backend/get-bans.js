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

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
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

    const queryPromise = base('Bans').select({
      sort: [{field: 'Ban Date', direction: 'desc'}],
      maxRecords: 100,
    }).firstPage();

    const records = await Promise.race([queryPromise, timeoutPromise]);

    // Transform records to a more usable format
    const bans = records.map(record => {
      const fields = record.fields;
      return {
        recordId: record.id,
        playerName: fields['Player Name'] || 'Unknown',
        playerUID: fields['Player UID'] || '',
        deviceId: fields['Device ID'] || '',
        banReason: fields['Ban Reason'] || '',
        banType: fields['Ban Type'] || '',
        banStatus: fields['BAN STATUS'] || 'Active',
        banDate: fields['Ban Date'] || '',
        banTime: fields['Ban Time'] || '',
        banExpiryDate: fields['Ban Expiry Date'] || null,
        bannedBy: fields['Banned By'] || 'Admin',
        unbanDate: fields['Unban Date'] || null,
        unbanTime: fields['Unban Time'] || null,
        adminAction: fields['Admin Action'] || null
      };
    });

    console.log(`Retrieved ${bans.length} bans`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        bans: bans,
        total: bans.length,
        timestamp: new Date().toISOString()
      }),
    };

  } catch (error) {
    console.error('Error in get-bans:', error);

    // Return a detailed error response
    const errorResponse = {
      success: false,
      message: 'Server error while fetching bans',
      error: error.message,
      timestamp: new Date().toISOString(),
      function: 'get-bans'
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
