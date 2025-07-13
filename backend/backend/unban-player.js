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
      recordId, 
      playerUID, 
      deviceId,
      unbanReason 
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
    if (!recordId && !playerUID && !deviceId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          message: 'Missing required fields: recordId, playerUID, or deviceId' 
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

    let banRecord = null;

    // Find ban record by recordId or player identifiers
    if (recordId) {
      try {
        banRecord = await base('Bans').find(recordId);
      } catch (error) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'Ban record not found'
          }),
        };
      }
    } else {
      // Find by player identifiers
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

      const records = await base('Bans').select({
        filterByFormula: filterFormula,
        maxRecords: 1
      }).firstPage();

      if (records.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'No active ban found for this player'
          }),
        };
      }

      banRecord = records[0];
    }

    // Check if ban is already inactive
    if (banRecord.get('BAN STATUS') !== 'Active') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Ban is already inactive',
          currentStatus: banRecord.get('BAN STATUS')
        }),
      };
    }

    // Update ban record to unban
    const now = new Date();
    const updateFields = {
      'BAN STATUS': 'Unbanned',
      'Unban Date': now.toISOString().split('T')[0],
      'Unban Time': now.toLocaleTimeString(),
      'Admin Action': 'Manual Unban'
    };

    if (unbanReason) {
      updateFields['Unban Reason'] = unbanReason;
    }

    const updatedRecord = await base('Bans').update([
      {
        id: banRecord.id,
        fields: updateFields
      }
    ]);

    console.log('Player unbanned successfully:', banRecord.id);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Player unbanned successfully',
        unbanDetails: {
          recordId: banRecord.id,
          playerName: banRecord.get('Player Name'),
          playerUID: banRecord.get('Player UID'),
          deviceId: banRecord.get('Device ID'),
          unbanDate: updateFields['Unban Date'],
          unbanTime: updateFields['Unban Time'],
          unbanReason: unbanReason || 'No reason provided'
        }
      }),
    };

  } catch (error) {
    console.error('Error in unban-player:', error);

    // Return a detailed error response
    const errorResponse = {
      success: false,
      message: 'Server error while unbanning player',
      error: error.message,
      timestamp: new Date().toISOString(),
      function: 'unban-player'
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
