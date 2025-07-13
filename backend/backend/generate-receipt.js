const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

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
    // Validate that event.body exists and is a string
    if (!event.body || typeof event.body !== 'string') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Invalid request body' }),
      };
    }

    const data = JSON.parse(event.body);
    const { userName, paymentDate, amount, utrNumber, paid } = data;

    // Validate required fields
    if (!userName || !paymentDate) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Missing required fields: userName and paymentDate' }),
      };
    }

    // Create a new PDF document
    const pdfDoc = await PDFDocument.create();

    // Add a page
    const page = pdfDoc.addPage([400, 300]);
    const { width, height } = page.getSize();

    // Set fonts
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Draw title
    page.drawText('Tournament Registration Receipt', {
      x: 50,
      y: height - 50,
      size: 18,
      font: fontBold,
      color: rgb(0, 0.53, 0.71),
    });

    // Draw user name
    page.drawText(`Name: ${userName}`, {
      x: 50,
      y: height - 90,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });

    // Draw payment date
    page.drawText(`Date: ${paymentDate}`, {
      x: 50,
      y: height - 110,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });

    // Draw amount
    page.drawText(`Amount: ₹${amount}`, {
      x: 50,
      y: height - 130,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });

    // Draw UTR number if provided
    if (utrNumber && utrNumber.trim() !== '') {
      page.drawText(`UTR Number: ${utrNumber}`, {
        x: 50,
        y: height - 150,
        size: 12,
        font,
        color: rgb(0, 0, 0),
      });
    }

    // Draw payment status
    const paymentStatusText = paid ? 'Payment Status: PAID' : 'Payment Status: NOT PAID';
    const paymentStatusColor = paid ? rgb(0, 0.6, 0) : rgb(0.8, 0, 0);

    page.drawText(paymentStatusText, {
      x: 50,
      y: height - 180,
      size: 14,
      font: fontBold,
      color: paymentStatusColor,
    });

    // Serialize the PDF to bytes (a Uint8Array)
    const pdfBytes = await pdfDoc.save();

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=receipt_${userName.replace(/\s+/g, '_')}.pdf`,
      },
      body: Buffer.from(pdfBytes).toString('base64'),
      isBase64Encoded: true,
    };
  } catch (error) {
    console.error('Error generating receipt PDF:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to generate receipt', message: error.message }),
    };
  }
};
