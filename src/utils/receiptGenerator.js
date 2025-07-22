const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// Ensure receipts directory exists
const receiptsDir = path.join(__dirname, '../../receipts');
if (!fs.existsSync(receiptsDir)) {
  fs.mkdirSync(receiptsDir, { recursive: true });
}

const generateReceipt = async (paymentData) => {
  try {
    const {
      paymentId,
      userName,
      userEmail,
      tournamentTitle,
      amount,
      currency,
      paymentDate,
      transactionId,
      receiptNumber
    } = paymentData;

    // Create PDF document
    const doc = new PDFDocument({ margin: 50 });
    
    // Generate filename
    const filename = `receipt_${paymentId}_${Date.now()}.pdf`;
    const filepath = path.join(receiptsDir, filename);
    
    // Pipe PDF to file
    doc.pipe(fs.createWriteStream(filepath));

    // Colors
    const primaryColor = '#00f2ff';
    const secondaryColor = '#8a2be2';
    const textColor = '#333333';
    const lightGray = '#f5f5f5';

    // Header
    doc.fontSize(24)
       .fillColor(primaryColor)
       .text('SR BIRD', 50, 50, { align: 'left' })
       .fontSize(12)
       .fillColor(textColor)
       .text('Official Gaming Tournament Platform', 50, 80);

    // Receipt title
    doc.fontSize(20)
       .fillColor(secondaryColor)
       .text('PAYMENT RECEIPT', 50, 120, { align: 'center' });

    // Receipt number and date
    doc.fontSize(10)
       .fillColor(textColor)
       .text(`Receipt #: ${receiptNumber || `RCP-${Date.now()}`}`, 400, 50)
       .text(`Date: ${new Date(paymentDate).toLocaleDateString()}`, 400, 65)
       .text(`Time: ${new Date(paymentDate).toLocaleTimeString()}`, 400, 80);

    // Horizontal line
    doc.strokeColor(primaryColor)
       .lineWidth(2)
       .moveTo(50, 160)
       .lineTo(550, 160)
       .stroke();

    // Payment details section
    let yPosition = 190;
    
    doc.fontSize(14)
       .fillColor(secondaryColor)
       .text('PAYMENT DETAILS', 50, yPosition);
    
    yPosition += 30;
    
    const details = [
      ['Customer Name:', userName],
      ['Email:', userEmail],
      ['Tournament:', tournamentTitle],
      ['Amount:', `${getCurrencySymbol(currency)}${amount.toFixed(2)}`],
      ['Transaction ID:', transactionId],
      ['Payment Method:', 'Online Payment'],
      ['Status:', 'COMPLETED']
    ];

    details.forEach(([label, value]) => {
      doc.fontSize(11)
         .fillColor(textColor)
         .text(label, 50, yPosition, { width: 150 })
         .text(value, 200, yPosition, { width: 300 });
      yPosition += 20;
    });

    // Tournament registration confirmation
    yPosition += 20;
    doc.rect(50, yPosition, 500, 60)
       .fillAndStroke(lightGray, primaryColor);
    
    doc.fontSize(12)
       .fillColor(secondaryColor)
       .text('TOURNAMENT REGISTRATION CONFIRMED', 60, yPosition + 10)
       .fontSize(10)
       .fillColor(textColor)
       .text('Your registration for the tournament has been successfully completed.', 60, yPosition + 30)
       .text('Please keep this receipt for your records.', 60, yPosition + 45);

    // QR Code for verification
    yPosition += 100;
    
    try {
      const qrData = JSON.stringify({
        receiptId: receiptNumber || `RCP-${Date.now()}`,
        paymentId: paymentId,
        transactionId: transactionId,
        amount: amount,
        date: paymentDate
      });
      
      const qrCodeBuffer = await QRCode.toBuffer(qrData, {
        width: 100,
        margin: 1,
        color: {
          dark: primaryColor,
          light: '#FFFFFF'
        }
      });
      
      doc.image(qrCodeBuffer, 450, yPosition, { width: 80 });
      
      doc.fontSize(8)
         .fillColor(textColor)
         .text('Scan QR code for verification', 440, yPosition + 90);
    } catch (qrError) {
      logger.error('Error generating QR code:', qrError);
    }

    // Terms and conditions
    yPosition += 120;
    doc.fontSize(8)
       .fillColor(textColor)
       .text('Terms & Conditions:', 50, yPosition)
       .text('• This receipt is valid for tournament participation only.', 50, yPosition + 15)
       .text('• Refunds are subject to tournament terms and conditions.', 50, yPosition + 25)
       .text('• For support, contact: support@srbird.com', 50, yPosition + 35)
       .text('• Tournament rules and regulations apply.', 50, yPosition + 45);

    // Footer
    yPosition += 80;
    doc.strokeColor(primaryColor)
       .lineWidth(1)
       .moveTo(50, yPosition)
       .lineTo(550, yPosition)
       .stroke();

    doc.fontSize(8)
       .fillColor(textColor)
       .text('SR BIRD Gaming Tournament Platform', 50, yPosition + 10)
       .text('Generated automatically - No signature required', 50, yPosition + 20)
       .text(`Generated on: ${new Date().toLocaleString()}`, 400, yPosition + 10);

    // Finalize PDF
    doc.end();

    // Wait for PDF to be written
    await new Promise((resolve, reject) => {
      doc.on('end', resolve);
      doc.on('error', reject);
    });

    logger.info(`Receipt generated: ${filename} for payment ${paymentId}`);

    // Return file path or URL (in production, you might upload to cloud storage)
    return `/receipts/${filename}`;
    
  } catch (error) {
    logger.error('Error generating receipt:', error);
    throw new Error('Failed to generate receipt');
  }
};

const getCurrencySymbol = (currency) => {
  const symbols = {
    'INR': '₹',
    'USD': '$',
    'EUR': '€'
  };
  return symbols[currency] || currency;
};

// Function to verify receipt QR code
const verifyReceiptQR = (qrData) => {
  try {
    const data = JSON.parse(qrData);
    
    // Basic validation
    if (!data.receiptId || !data.paymentId || !data.transactionId) {
      return { valid: false, error: 'Invalid QR code data' };
    }
    
    return { valid: true, data };
  } catch (error) {
    return { valid: false, error: 'Invalid QR code format' };
  }
};

// Function to get receipt file path
const getReceiptPath = (filename) => {
  return path.join(receiptsDir, filename);
};

// Function to check if receipt exists
const receiptExists = (filename) => {
  return fs.existsSync(path.join(receiptsDir, filename));
};

// Function to delete receipt file
const deleteReceipt = (filename) => {
  try {
    const filepath = path.join(receiptsDir, filename);
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      return true;
    }
    return false;
  } catch (error) {
    logger.error('Error deleting receipt:', error);
    return false;
  }
};

// Function to clean up old receipts (older than 30 days)
const cleanupOldReceipts = () => {
  try {
    const files = fs.readdirSync(receiptsDir);
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    let deletedCount = 0;
    
    files.forEach(file => {
      const filepath = path.join(receiptsDir, file);
      const stats = fs.statSync(filepath);
      
      if (stats.mtime.getTime() < thirtyDaysAgo) {
        fs.unlinkSync(filepath);
        deletedCount++;
      }
    });
    
    logger.info(`Cleaned up ${deletedCount} old receipt files`);
    return deletedCount;
  } catch (error) {
    logger.error('Error cleaning up old receipts:', error);
    return 0;
  }
};

module.exports = {
  generateReceipt,
  verifyReceiptQR,
  getReceiptPath,
  receiptExists,
  deleteReceipt,
  cleanupOldReceipts
};
