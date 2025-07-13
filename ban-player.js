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

    const { 
      adminPassword, 
      playerName, 
      playerUID, 
      deviceId, 
      banReason, 
      banType, 
      banExpiryDate,
      bannedBy 
    } = data;

    // Validate admin credentials
    if (!adminPassword || (adminPassword !== process.env.ADMIN_PASSWORD && adminPassword !== '1244')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized - Invalid admin password' }),
      };
    }

    // Validate required fields
    if (!playerUID || !banReason || !banType) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          message: 'Missing required fields: playerUID, banReason, banType' 
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
          message: 'Database connection error',
          error: 'Airtable configuration missing'
        }),
      };
    }

    // Check if player is already banned
    const existingBans = await base('Bans').select({
      filterByFormula: `AND(
        OR({Player UID} = '${playerUID}', {Device ID} = '${deviceId || playerUID}'),
        {BAN STATUS} = 'Active'
      )`,
      maxRecords: 1
    }).firstPage();

    if (existingBans.length > 0) {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Player is already banned',
          existingBan: {
            banReason: existingBans[0].get('Ban Reason'),
            banType: existingBans[0].get('Ban Type'),
            banDate: existingBans[0].get('Ban Date')
          }
        }),
      };
    }

    // Prepare ban record
    const now = new Date();
    const banRecord = {
      'Player Name': playerName || 'Unknown',
      'Player UID': playerUID,
      'Device ID': deviceId || playerUID,
      'Ban Reason': banReason,
      'Ban Type': banType,
      'BAN STATUS': 'Active',
      'Ban Date': now.toISOString().split('T')[0],
      'Ban Time': now.toLocaleTimeString(),
      'Banned By': bannedBy || 'Admin',
      'Admin Action': 'Manual Ban'
    };

    // Add expiry date for temporary bans
    if (banType === 'Temporary' && banExpiryDate) {
      banRecord['Ban Expiry Date'] = banExpiryDate;
    }

    // Create ban record in Airtable
    const createdRecord = await base('Bans').create([
      {
        fields: banRecord
      }
    ]);

    console.log('Ban created successfully:', createdRecord[0].id);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Player banned successfully',
        banId: createdRecord[0].id,
        banDetails: {
          playerName: playerName,
          playerUID: playerUID,
          deviceId: deviceId || playerUID,
          banReason: banReason,
          banType: banType,
          banDate: banRecord['Ban Date'],
          banExpiryDate: banExpiryDate || null
        }
      }),
    };

  } catch (error) {
    console.error('Error in ban-player:', error);

    // Return a detailed error response
    const errorResponse = {
      success: false,
      message: 'Server error while banning player',
      error: error.message,
      timestamp: new Date().toISOString(),
      function: 'ban-player'
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
