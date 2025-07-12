const Airtable = require('airtable');
const crypto = require('crypto');

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);

function generateTokenId() {
  return 'token-' + crypto.randomBytes(8).toString('hex');
}

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: 'Method Not Allowed' }),
    };
  }

  try {
    const tokenId = generateTokenId();

    // Create new token record in Airtable with Used = false
    const createdRecord = await base('Tokens').create([
      {
        fields: {
          'Token ID': tokenId,
          'Used': false,
        },
      },
    ]);

    return {
      statusCode: 200,
      body: JSON.stringify({ tokenId }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Server error', error: error.message }),
    };
  }
};
