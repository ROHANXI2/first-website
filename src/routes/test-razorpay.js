const express = require('express');
const Razorpay = require('razorpay');
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Test Razorpay
 *   description: Test endpoints for Razorpay integration
 */

/**
 * @swagger
 * /api/v1/test-razorpay/config:
 *   get:
 *     summary: Test Razorpay configuration
 *     tags: [Test Razorpay]
 *     responses:
 *       200:
 *         description: Razorpay configuration status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     keyId:
 *                       type: string
 *                     testMode:
 *                       type: boolean
 *                     configured:
 *                       type: boolean
 *       500:
 *         description: Configuration error
 */
router.get('/config', (req, res) => {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const testMode = process.env.RAZORPAY_TEST_MODE === 'true';
    
    if (!keyId || !keySecret) {
      return res.status(500).json({
        success: false,
        message: 'Razorpay credentials not configured',
        data: {
          keyId: !!keyId,
          keySecret: !!keySecret,
          configured: false
        }
      });
    }

    res.status(200).json({
      success: true,
      message: 'Razorpay is properly configured',
      data: {
        keyId: keyId.substring(0, 8) + '...' + keyId.slice(-4), // Partially hide key
        testMode: testMode,
        configured: true,
        keyType: keyId.startsWith('rzp_test_') ? 'TEST' : 'LIVE'
      }
    });
  } catch (error) {
    console.error('Error checking Razorpay config:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking Razorpay configuration',
      error: error.message
    });
  }
});

/**
 * @swagger
 * /api/v1/test-razorpay/create-test-order:
 *   post:
 *     summary: Create a test Razorpay order
 *     tags: [Test Razorpay]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *                 default: 10
 *               currency:
 *                 type: string
 *                 default: "INR"
 *     responses:
 *       200:
 *         description: Test order created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *       500:
 *         description: Error creating test order
 */
router.post('/create-test-order', async (req, res) => {
  try {
    const { amount = 10, currency = 'INR' } = req.body;
    
    // Initialize Razorpay
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    // Create test order
    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100), // Convert to paise
      currency: currency,
      receipt: `test_order_${Date.now()}`,
      notes: {
        purpose: 'test_order',
        created_at: new Date().toISOString()
      }
    });

    res.status(200).json({
      success: true,
      message: 'Test order created successfully',
      data: {
        orderId: order.id,
        amount: order.amount,
        amountInRupees: order.amount / 100,
        currency: order.currency,
        status: order.status,
        receipt: order.receipt,
        created_at: order.created_at,
        keyId: process.env.RAZORPAY_KEY_ID
      }
    });
  } catch (error) {
    console.error('Error creating test order:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating test order',
      error: error.message,
      details: error.description || 'Unknown error occurred'
    });
  }
});

/**
 * @swagger
 * /api/v1/test-razorpay/payment-form:
 *   get:
 *     summary: Get a simple payment test form
 *     tags: [Test Razorpay]
 *     responses:
 *       200:
 *         description: HTML form for testing payments
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 */
// Serve external JavaScript file for CSP compliance
router.get('/test-script.js', (req, res) => {
  const script = `
    function showResult(message, type = 'info') {
        const resultDiv = document.getElementById('result');
        if (resultDiv) {
            resultDiv.innerHTML = '<div class="result ' + type + '">' + message + '</div>';
        }
    }

    async function testOrder(amount) {
        try {
            showResult('Creating test order...', 'info');
            
            const response = await fetch('/api/v1/test-razorpay/create-test-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount, currency: 'INR' })
            });

            const result = await response.json();
            
            if (result.success) {
                showResult(
                    '<strong>✅ Order Created Successfully!</strong><br>' +
                    'Order ID: ' + result.data.orderId + '<br>' +
                    'Amount: ₹' + result.data.amountInRupees + '<br>' +
                    'Status: ' + result.data.status + '<br>' +
                    'Receipt: ' + result.data.receipt,
                    'success'
                );
            } else {
                showResult('❌ Error: ' + result.message, 'error');
            }
        } catch (error) {
            showResult('❌ Network Error: ' + error.message, 'error');
        }
    }

    // Attach event listeners after DOM loads
    document.addEventListener('DOMContentLoaded', function() {
        const btn10 = document.getElementById('test10');
        const btn50 = document.getElementById('test50');
        
        if (btn10) btn10.addEventListener('click', () => testOrder(10));
        if (btn50) btn50.addEventListener('click', () => testOrder(50));
    });
  `;
  
  res.setHeader('Content-Type', 'application/javascript');
  res.send(script);
});

// CSP-compliant test page without inline scripts
router.get('/simple-test', (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>SR Bird - Simple Razorpay Test</title>
        <style>
            body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; max-width: 600px; margin: 0 auto; }
            .btn { background: #3498db; color: white; padding: 12px 24px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; margin: 10px 5px; }
            .btn:hover { background: #2980b9; }
            .info { background: #e8f4f8; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .result { padding: 15px; border-radius: 5px; margin: 15px 0; }
            .success { background: #d4edda; color: #155724; }
            .error { background: #f8d7da; color: #721c24; }
        </style>
    </head>
    <body>
        <h2>🐦 SR Bird - Simple Razorpay Test</h2>
        
        <div class="info">
            <strong>Test Mode:</strong> Using Razorpay test keys<br>
            <strong>Key ID:</strong> ${process.env.RAZORPAY_KEY_ID}<br>
            <strong>Note:</strong> This will test the order creation API only.
        </div>

        <button class="btn" id="test10">Test ₹10 Order Creation</button>
        <button class="btn" id="test50">Test ₹50 Order Creation</button>
        
        <div id="result"></div>
        
        <div class="info">
            <strong>For Full Payment Testing:</strong><br>
            Visit: <a href="/api/v1/test-razorpay/payment-form">/api/v1/test-razorpay/payment-form</a>
        </div>

        <script src="/api/v1/test-razorpay/test-script.js"></script>
    </body>
    </html>
  `;
  
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

router.get('/payment-form', (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>SR Bird - Razorpay Test Payment</title>
        <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
        <style>
            body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
            .btn { background: #3498db; color: white; padding: 12px 24px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; margin: 10px 5px; }
            .btn:hover { background: #2980b9; }
            .info { background: #e8f4f8; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .success { background: #d4edda; color: #155724; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .error { background: #f8d7da; color: #721c24; padding: 15px; border-radius: 5px; margin: 15px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <h2>🐦 SR Bird - Razorpay Test Payment</h2>
            
            <div class="info">
                <strong>Test Mode:</strong> Using Razorpay test keys<br>
                <strong>Key ID:</strong> ${process.env.RAZORPAY_KEY_ID}<br>
                <strong>Note:</strong> This is a test environment. No real money will be charged.
            </div>

            <button class="btn" onclick="createTestOrder(10)">Test ₹10 Payment</button>
            <button class="btn" onclick="createTestOrder(50)">Test ₹50 Payment</button>
            <button class="btn" onclick="createTestOrder(100)">Test ₹100 Payment</button>

            <div id="result"></div>
        </div>

        <script>
            function showResult(message, type = 'info') {
                const resultDiv = document.getElementById('result');
                resultDiv.innerHTML = '<div class="' + type + '">' + message + '</div>';
            }

            async function createTestOrder(amount) {
                try {
                    showResult('Creating test order...', 'info');
                    
                    const response = await fetch('/api/v1/test-razorpay/create-test-order', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ amount, currency: 'INR' })
                    });

                    const orderData = await response.json();
                    
                    if (!orderData.success) {
                        throw new Error(orderData.message || 'Failed to create order');
                    }

                    // Open Razorpay payment interface
                    const options = {
                        key: orderData.data.keyId,
                        amount: orderData.data.amount,
                        currency: orderData.data.currency,
                        name: 'SR Bird Gaming',
                        description: 'Test Payment for Tournament',
                        order_id: orderData.data.orderId,
                        handler: function(response) {
                            showResult(
                                '<strong>Payment Successful!</strong><br>' +
                                'Payment ID: ' + response.razorpay_payment_id + '<br>' +
                                'Order ID: ' + response.razorpay_order_id + '<br>' +
                                'Signature: ' + response.razorpay_signature.substring(0, 20) + '...',
                                'success'
                            );
                        },
                        prefill: {
                            name: 'Test User',
                            email: 'test@srbird.com',
                            contact: '9999999999'
                        },
                        theme: {
                            color: '#3498db'
                        },
                        modal: {
                            ondismiss: function() {
                                showResult('Payment cancelled by user', 'error');
                            }
                        }
                    };

                    const rzp = new Razorpay(options);
                    rzp.open();
                } catch (error) {
                    showResult('Error: ' + error.message, 'error');
                }
            }
        </script>
    </body>
    </html>
  `;
  
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// No-CSP test page for debugging
router.get('/no-csp-test', (req, res) => {
  // Temporarily disable CSP for this route
  res.removeHeader('Content-Security-Policy');
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>SR Bird - No CSP Test</title>
        <meta http-equiv="Content-Security-Policy" content="">
        <style>
            body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; max-width: 600px; margin: 0 auto; }
            .btn { background: #3498db; color: white; padding: 12px 24px; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; margin: 10px 5px; }
            .btn:hover { background: #2980b9; }
            .info { background: #e8f4f8; padding: 15px; border-radius: 5px; margin: 15px 0; }
            .result { padding: 15px; border-radius: 5px; margin: 15px 0; }
            .success { background: #d4edda; color: #155724; }
            .error { background: #f8d7da; color: #721c24; }
        </style>
    </head>
    <body>
        <h2>🐦 SR Bird - No CSP Test</h2>
        
        <div class="info">
            <strong>Test Mode:</strong> Using Razorpay test keys<br>
            <strong>Key ID:</strong> ${process.env.RAZORPAY_KEY_ID}<br>
            <strong>Note:</strong> This page has CSP disabled for testing.
        </div>

        <button class="btn" onclick="testOrder(10)">Test ₹10 Order Creation</button>
        <button class="btn" onclick="testOrder(50)">Test ₹50 Order Creation</button>
        
        <div id="result"></div>

        <script>
            function showResult(message, type = 'info') {
                document.getElementById('result').innerHTML = '<div class="result ' + type + '">' + message + '</div>';
            }

            async function testOrder(amount) {
                try {
                    showResult('Creating test order...', 'info');
                    
                    const response = await fetch('/api/v1/test-razorpay/create-test-order', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ amount, currency: 'INR' })
                    });

                    const result = await response.json();
                    
                    if (result.success) {
                        showResult(
                            '<strong>✅ Order Created Successfully!</strong><br>' +
                            'Order ID: ' + result.data.orderId + '<br>' +
                            'Amount: ₹' + result.data.amountInRupees + '<br>' +
                            'Status: ' + result.data.status + '<br>' +
                            'Receipt: ' + result.data.receipt,
                            'success'
                        );
                    } else {
                        showResult('❌ Error: ' + result.message, 'error');
                    }
                } catch (error) {
                    showResult('❌ Network Error: ' + error.message, 'error');
                }
            }
        </script>
    </body>
    </html>
  `;
  
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

module.exports = router;
