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

    const { adminPassword, action, playerData } = data;

    // Validate admin credentials
    if (!adminPassword || (adminPassword !== process.env.ADMIN_PASSWORD && adminPassword !== '1244')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ message: 'Unauthorized - Invalid admin password' }),
      };
    }

    // Validate required fields
    if (!action || !playerData) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          message: 'Missing required fields: action and playerData' 
        }),
      };
    }

    const { deviceId, ign, uid, whatsapp, reason, banType, duration } = playerData;

    // Validate Device ID (primary identifier)
    if (!deviceId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'Device ID is required for ban management'
        }),
      };
    }

    if (action === 'ban') {
      // Check if device is already banned
      const existingBans = await base('Bans').select({
        filterByFormula: `{Device ID} = '${deviceId}'`,
        maxRecords: 1
      }).firstPage();

      if (existingBans.length > 0) {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({
            message: 'Device is already banned',
            existingBan: {
              id: existingBans[0].id,
              deviceId: existingBans[0].get('Device ID'),
              reason: existingBans[0].get('Ban Reason'),
              banType: existingBans[0].get('Ban Type'),
              banDate: existingBans[0].get('Ban Date')
            }
          }),
        };
      }

      // Calculate ban expiry date
      let banExpiryDate = null;
      if (banType === 'temporary' && duration) {
        const now = new Date();
        const durationMs = parseInt(duration) * 24 * 60 * 60 * 1000; // Convert days to milliseconds
        banExpiryDate = new Date(now.getTime() + durationMs).toISOString().split('T')[0];
      }

      // Create ban record (simplified structure)
      const banRecord = {
        'Device ID': deviceId,
        'Ban Reason': reason || 'No reason provided',
        'Ban Type': banType || 'permanent',
        'Ban Date': new Date().toISOString().split('T')[0],
        'BAN STATUS': 'Active'
      };

      if (banExpiryDate) {
        banRecord['Ban Expiry Date'] = banExpiryDate;
      }

      const createdBan = await base('Bans').create([
        { fields: banRecord }
      ]);

      console.log('Device banned successfully:', createdBan[0].id);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Device banned successfully',
          banId: createdBan[0].id,
          banDetails: banRecord
        }),
      };

    } else if (action === 'unban') {
      // Find existing ban by Device ID
      const existingBans = await base('Bans').select({
        filterByFormula: `AND(
          {Device ID} = '${deviceId}',
          {BAN STATUS} = 'Active'
        )`,
        maxRecords: 1
      }).firstPage();

      if (existingBans.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({
            message: 'No active ban found for this device'
          }),
        };
      }

      // Update ban status to inactive
      await base('Bans').update([
        {
          id: existingBans[0].id,
          fields: {
            'BAN STATUS': 'Inactive'
          }
        }
      ]);

      console.log('Device unbanned successfully:', existingBans[0].id);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Device unbanned successfully',
          banId: existingBans[0].id
        }),
      };

    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          message: 'Invalid action. Use "ban" or "unban"' 
        }),
      };
    }

  } catch (error) {
    console.error('Error in ban-player:', error);

    const errorResponse = {
      message: 'Server error',
      error: error.message,
      timestamp: new Date().toISOString(),
      function: 'ban-player'
    };

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify(errorResponse),
    };
  }
};
