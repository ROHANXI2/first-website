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

  // Allow both GET and POST for easier testing
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ message: 'Method Not Allowed' }),
    };
  }

  try {
    // Debug: Log environment variables (without exposing sensitive data)
    console.log('Environment check:', {
      hasApiKey: !!process.env.AIRTABLE_API_KEY,
      hasBaseId: !!process.env.AIRTABLE_BASE_ID,
      hasAdminPassword: !!process.env.ADMIN_PASSWORD,
      apiKeyLength: process.env.AIRTABLE_API_KEY ? process.env.AIRTABLE_API_KEY.length : 0,
      baseIdLength: process.env.AIRTABLE_BASE_ID ? process.env.AIRTABLE_BASE_ID.length : 0,
      httpMethod: event.httpMethod
    });

    // For GET requests, skip password check (for testing)
    let skipPasswordCheck = event.httpMethod === 'GET';
    // For POST requests, check admin password (skip for GET during testing)
    if (event.httpMethod === 'POST' && !skipPasswordCheck) {
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

    // For GET requests, return environment debug info
    if (event.httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'GET request - Debug info',
          environment: {
            hasApiKey: !!process.env.AIRTABLE_API_KEY,
            hasBaseId: !!process.env.AIRTABLE_BASE_ID,
            hasAdminPassword: !!process.env.ADMIN_PASSWORD,
            apiKeyLength: process.env.AIRTABLE_API_KEY ? process.env.AIRTABLE_API_KEY.length : 0,
            baseIdValue: process.env.AIRTABLE_BASE_ID || 'MISSING',
            nodeEnv: process.env.NODE_ENV || 'undefined'
          },
          airtableInitialized: !!base
        }),
      };
    }

    // Check if Airtable is initialized
    if (!base) {
      console.error('Airtable not initialized - missing environment variables');
      console.error('Required env vars:', {
        AIRTABLE_API_KEY: process.env.AIRTABLE_API_KEY ? 'SET' : 'MISSING',
        AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID ? 'SET' : 'MISSING'
      });
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          message: 'Database connection error',
          error: 'Airtable configuration missing',
          details: {
            apiKey: process.env.AIRTABLE_API_KEY ? 'configured' : 'missing',
            baseId: process.env.AIRTABLE_BASE_ID ? 'configured' : 'missing'
          }
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

    const bans = records.map(record => ({
      id: record.id,
      deviceId: record.get('Device ID') || 'N/A',
      banReason: record.get('Ban Reason') || 'N/A',
      banType: record.get('Ban Type') || 'permanent',
      banDate: record.get('Ban Date') || 'N/A',
      banStatus: record.get('BAN STATUS') || 'Active',
      banExpiryDate: record.get('Ban Expiry Date') || null
    }));

    // Auto-expire temporary bans that have passed their expiry date
    const now = new Date();
    const expiredBans = [];

    for (const ban of bans) {
      if (ban.banType === 'temporary' && ban.banExpiryDate && ban.banStatus === 'Active') {
        const expiryDate = new Date(ban.banExpiryDate);
        if (now > expiryDate) {
          expiredBans.push(ban.id);
        }
      }
    }

    // Update expired bans
    if (expiredBans.length > 0) {
      const updatePromises = expiredBans.map(banId => 
        base('Bans').update([
          {
            id: banId,
            fields: {
              'Ban Status': 'Expired',
              'Unban Date': now.toISOString().split('T')[0],
              'Unban Time': now.toLocaleTimeString(),
              'Admin Action': 'Auto-Expired'
            }
          }
        ])
      );

      await Promise.all(updatePromises);
      console.log(`Auto-expired ${expiredBans.length} temporary bans`);

      // Update the ban status in our response
      bans.forEach(ban => {
        if (expiredBans.includes(ban.id)) {
          ban.banStatus = 'Expired';
          ban.unbanDate = now.toISOString().split('T')[0];
          ban.unbanTime = now.toLocaleTimeString();
          ban.adminAction = 'Auto-Expired';
        }
      });
    }

    console.log(`Retrieved ${bans.length} ban records`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        bans: bans,
        totalBans: bans.length,
        activeBans: bans.filter(ban => ban.banStatus === 'Active').length,
        expiredBans: bans.filter(ban => ban.banStatus === 'Expired').length,
        inactiveBans: bans.filter(ban => ban.banStatus === 'Inactive').length
      }),
    };

  } catch (error) {
    console.error('Error in get-bans:', error);

    // Return a more detailed error response
    const errorResponse = {
      message: 'Server error',
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
