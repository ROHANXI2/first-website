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

    const { deviceId } = data;

    // Validate that Device ID is provided
    if (!deviceId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: 'Device ID is required to check ban status'
        }),
      };
    }

    // Build filter formula for checking bans by Device ID
    const filterFormula = `AND(
      {Device ID} = '${deviceId}',
      {BAN STATUS} = 'Active'
    )`;

    // Check for active bans
    const bans = await base('Bans').select({
      filterByFormula: filterFormula,
      maxRecords: 10
    }).firstPage();

    if (bans.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          isBanned: false,
          message: 'Device is not banned'
        }),
      };
    }

    // Check if any temporary bans have expired
    const activeBans = [];
    const now = new Date();

    for (const ban of bans) {
      const banType = ban.get('Ban Type');
      const banExpiryDate = ban.get('Ban Expiry Date');

      if (banType === 'temporary' && banExpiryDate) {
        const expiryDate = new Date(banExpiryDate);
        if (now > expiryDate) {
          // Ban has expired, update status
          await base('Bans').update([
            {
              id: ban.id,
              fields: {
                'BAN STATUS': 'Expired'
              }
            }
          ]);
          console.log('Temporary ban expired and updated:', ban.id);
        } else {
          activeBans.push(ban);
        }
      } else {
        activeBans.push(ban);
      }
    }

    if (activeBans.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          isBanned: false,
          message: 'Device is not banned (temporary bans expired)'
        }),
      };
    }

    // Device has active bans
    const banDetails = activeBans.map(ban => ({
      id: ban.id,
      deviceId: ban.get('Device ID'),
      reason: ban.get('Ban Reason'),
      banType: ban.get('Ban Type'),
      banDate: ban.get('Ban Date'),
      banTime: ban.get('Ban Time'),
      banExpiryDate: ban.get('Ban Expiry Date') || null,
      ign: ban.get('In-Game Name'),
      uid: ban.get('Free Fire ID'),
      whatsapp: ban.get('WhatsApp')
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        isBanned: true,
        message: 'Device is banned',
        banCount: activeBans.length,
        bans: banDetails
      }),
    };

  } catch (error) {
    console.error('Error in check-ban:', error);

    const errorResponse = {
      message: 'Server error',
      error: error.message,
      timestamp: new Date().toISOString(),
      function: 'check-ban'
    };

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify(errorResponse),
    };
  }
};
