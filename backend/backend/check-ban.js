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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ message: 'Method Not Allowed' }),
    };
  }

  try {
    // Parse request body
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

    const { playerUID, deviceId } = data;

    // Validate required fields
    if (!playerUID && !deviceId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          banned: false,
          message: 'Missing required fields: playerUID or deviceId',
          banDetails: null
        }),
      };
    }

    // Check if Airtable is initialized
    if (!base) {
      console.error('Airtable not initialized - missing environment variables');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          banned: false,
          message: 'Database connection error',
          error: 'Airtable configuration missing',
          banDetails: null
        }),
      };
    }

    // Build filter formula
    let filterFormula = '';
    if (playerUID && deviceId) {
      filterFormula = `AND(
        OR({Player UID} = '${playerUID}', {Device ID} = '${deviceId}'),
        {BAN STATUS} = 'Active'
      )`;
    } else if (playerUID) {
      filterFormula = `AND(
        {Player UID} = '${playerUID}',
        {BAN STATUS} = 'Active'
      )`;
    } else {
      filterFormula = `AND(
        {Device ID} = '${deviceId}',
        {BAN STATUS} = 'Active'
      )`;
    }

    // Check for active bans with timeout
    let bans;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Database query timeout')), 10000);
      });

      const queryPromise = base('Bans').select({
        filterByFormula: filterFormula,
        maxRecords: 1
      }).firstPage();

      bans = await Promise.race([queryPromise, timeoutPromise]);
    } catch (queryError) {
      console.error('Airtable query error:', queryError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          success: false,
          banned: false,
          message: 'Database query failed',
          error: queryError.message,
          banDetails: null
        }),
      };
    }

    if (bans.length > 0) {
      const ban = bans[0];
      const banType = ban.get('Ban Type');
      const banExpiryDate = ban.get('Ban Expiry Date');

      // Check if temporary ban has expired
      if (banType === 'Temporary' && banExpiryDate) {
        const now = new Date();
        const expiryDate = new Date(banExpiryDate);

        if (now > expiryDate) {
          // Ban has expired, update status
          await base('Bans').update([
            {
              id: ban.id,
              fields: {
                'BAN STATUS': 'Expired',
                'Unban Date': now.toISOString().split('T')[0],
                'Unban Time': now.toLocaleTimeString(),
                'Admin Action': 'Auto-Expired'
              }
            }
          ]);

          console.log('Temporary ban expired:', ban.id);

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              banned: false,
              message: 'Ban has expired',
              banDetails: null
            }),
          };
        }
      }

      // Ban is still active
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          banned: true,
          message: 'Player is banned',
          banDetails: {
            recordId: ban.id,
            playerName: ban.get('Player Name'),
            playerUID: ban.get('Player UID'),
            deviceId: ban.get('Device ID'),
            banReason: ban.get('Ban Reason'),
            banType: ban.get('Ban Type'),
            banDate: ban.get('Ban Date'),
            banExpiryDate: ban.get('Ban Expiry Date'),
            bannedBy: ban.get('Banned By')
          }
        }),
      };
    }

    // No active ban found
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        banned: false,
        message: 'Player is not banned',
        banDetails: null
      }),
    };

  } catch (error) {
    console.error('Error in check-ban:', error);

    // Return a detailed error response
    const errorResponse = {
      success: false,
      message: 'Server error while checking ban status',
      error: error.message,
      timestamp: new Date().toISOString(),
      function: 'check-ban'
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
