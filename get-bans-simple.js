// Simplified get-bans function for testing
exports.handler = async function(event, context) {
  // Add CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

  try {
    // For testing - return a simple response first
    if (event.httpMethod === 'GET') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Function is working!',
          timestamp: new Date().toISOString(),
          environment: {
            hasApiKey: !!process.env.AIRTABLE_API_KEY,
            hasBaseId: !!process.env.AIRTABLE_BASE_ID,
            hasAdminPassword: !!process.env.ADMIN_PASSWORD
          }
        })
      };
    }

    // For POST requests, try Airtable connection
    if (event.httpMethod === 'POST') {
      // Check if Airtable module is available
      let Airtable;
      try {
        Airtable = require('airtable');
      } catch (error) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: 'Airtable module not found',
            message: 'Dependencies not installed properly'
          })
        };
      }

      // Check environment variables
      if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: 'Missing environment variables',
            details: {
              hasApiKey: !!process.env.AIRTABLE_API_KEY,
              hasBaseId: !!process.env.AIRTABLE_BASE_ID
            }
          })
        };
      }

      // Try to connect to Airtable
      try {
        const base = new Airtable({ 
          apiKey: process.env.AIRTABLE_API_KEY 
        }).base(process.env.AIRTABLE_BASE_ID);

        // Try to get records
        const records = await base('Bans').select({
          maxRecords: 5
        }).firstPage();

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'Airtable connection successful',
            recordCount: records.length,
            bans: records.map(record => ({
              id: record.id,
              deviceId: record.get('Device ID') || 'N/A',
              banReason: record.get('Ban Reason') || 'N/A',
              banType: record.get('Ban Type') || 'permanent',
              banDate: record.get('Ban Date') || 'N/A',
              banStatus: record.get('BAN STATUS') || 'Active'
            }))
          })
        };

      } catch (airtableError) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: 'Airtable connection failed',
            message: airtableError.message,
            suggestion: 'Check API key and base ID'
          })
        };
      }
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ message: 'Method not allowed' })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Function error',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};
