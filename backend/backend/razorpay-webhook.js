const crypto = require('crypto');
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

// Function to verify webhook signature
function verifyWebhookSignature(body, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  
  return expectedSignature === signature;
}

// Function to update payment status in Airtable
async function updatePaymentStatus(orderId, paymentId, status, paymentData = {}) {
  try {
    // Find registration record by Razorpay Order ID
    const records = await base('Registrations').select({
      filterByFormula: `{Razorpay Order ID} = '${orderId}'`,
      maxRecords: 1
    }).firstPage();

    if (records.length === 0) {
      console.log('No registration found for order ID:', orderId);
      return { success: false, message: 'Registration not found' };
    }

    const record = records[0];
    const updateFields = {
      'Payment Status': status,
      'Razorpay Payment ID': paymentId
    };

    // Add additional payment data if available
    if (paymentData.amount) {
      updateFields['Payment Amount'] = paymentData.amount;
    }
    if (paymentData.method) {
      updateFields['Payment Method'] = `Razorpay - ${paymentData.method}`;
    }

    // Update registration status based on payment status
    if (status === 'Paid') {
      updateFields['Registration Status'] = 'Confirmed';
    } else if (status === 'Failed') {
      updateFields['Registration Status'] = 'Payment Failed';
    }

    await base('Registrations').update([
      {
        id: record.id,
        fields: updateFields
      }
    ]);

    console.log('Registration updated successfully:', record.id);
    return { success: true, recordId: record.id };

  } catch (error) {
    console.error('Error updating registration:', error);
    return { success: false, error: error.message };
  }
}

exports.handler = async function(event, context) {
  // Add CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Razorpay-Signature',
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
    // Check if required services are initialized
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

    if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
      console.error('Razorpay webhook secret not found');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          message: 'Webhook configuration error',
          error: 'Razorpay webhook secret missing'
        }),
      };
    }

    // Get webhook signature from headers
    const webhookSignature = event.headers['x-razorpay-signature'] || 
                            event.headers['X-Razorpay-Signature'];

    if (!webhookSignature) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Missing webhook signature' }),
      };
    }

    // Validate request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Missing request body' }),
      };
    }

    // Verify webhook signature
    const isValidSignature = verifyWebhookSignature(
      event.body,
      webhookSignature,
      process.env.RAZORPAY_WEBHOOK_SECRET
    );

    if (!isValidSignature) {
      console.error('Invalid webhook signature');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid webhook signature' }),
      };
    }

    // Parse webhook payload
    const webhookData = JSON.parse(event.body);
    const { event: eventType, payload } = webhookData;

    console.log('Received webhook event:', eventType);

    // Handle different webhook events
    switch (eventType) {
      case 'payment.captured':
        {
          const payment = payload.payment.entity;
          const orderId = payment.order_id;
          const paymentId = payment.id;
          
          console.log('Payment captured:', paymentId, 'for order:', orderId);
          
          const updateResult = await updatePaymentStatus(orderId, paymentId, 'Paid', {
            amount: payment.amount,
            method: payment.method
          });

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              message: 'Payment captured webhook processed',
              event: eventType,
              payment_id: paymentId,
              order_id: orderId,
              update_result: updateResult
            }),
          };
        }

      case 'payment.failed':
        {
          const payment = payload.payment.entity;
          const orderId = payment.order_id;
          const paymentId = payment.id;
          
          console.log('Payment failed:', paymentId, 'for order:', orderId);
          
          const updateResult = await updatePaymentStatus(orderId, paymentId, 'Failed', {
            amount: payment.amount,
            method: payment.method
          });

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              message: 'Payment failed webhook processed',
              event: eventType,
              payment_id: paymentId,
              order_id: orderId,
              update_result: updateResult
            }),
          };
        }

      case 'order.paid':
        {
          const order = payload.order.entity;
          const orderId = order.id;
          
          console.log('Order paid:', orderId);
          
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              message: 'Order paid webhook processed',
              event: eventType,
              order_id: orderId
            }),
          };
        }

      default:
        console.log('Unhandled webhook event:', eventType);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'Webhook received but not processed',
            event: eventType
          }),
        };
    }

  } catch (error) {
    console.error('Error processing webhook:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Webhook processing failed',
        message: error.message,
        timestamp: new Date().toISOString()
      }),
    };
  }
};
