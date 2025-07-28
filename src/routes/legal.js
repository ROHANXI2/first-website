const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Legal
 *   description: Legal documents endpoints
 */

/**
 * @swagger
 * /api/v1/legal/privacy-policy:
 *   get:
 *     summary: Get Privacy Policy document
 *     tags: [Legal]
 *     responses:
 *       200:
 *         description: Privacy Policy PDF document
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Privacy Policy document not found
 *       500:
 *         description: Server error
 */
router.get('/privacy-policy', (req, res) => {
  try {
    const filePath = path.join(__dirname, '../../public/legal/privacy-policy.pdf');
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Privacy Policy document not found'
      });
    }

    // Set headers for PDF display
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="SR-Bird-Privacy-Policy.pdf"');
    
    // Send file
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving Privacy Policy:', error);
    res.status(500).json({
      success: false,
      message: 'Error serving Privacy Policy document'
    });
  }
});

/**
 * @swagger
 * /api/v1/legal/terms-of-service:
 *   get:
 *     summary: Get Terms of Service document
 *     tags: [Legal]
 *     responses:
 *       200:
 *         description: Terms of Service PDF document
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Terms of Service document not found
 *       500:
 *         description: Server error
 */
router.get('/terms-of-service', (req, res) => {
  try {
    const filePath = path.join(__dirname, '../../public/legal/terms-of-service.pdf');
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Terms of Service document not found'
      });
    }

    // Set headers for PDF display
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="SR-Bird-Terms-of-Service.pdf"');
    
    // Send file
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving Terms of Service:', error);
    res.status(500).json({
      success: false,
      message: 'Error serving Terms of Service document'
    });
  }
});

/**
 * @swagger
 * /api/v1/legal/download/privacy-policy:
 *   get:
 *     summary: Download Privacy Policy document
 *     tags: [Legal]
 *     responses:
 *       200:
 *         description: Privacy Policy PDF download
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Privacy Policy document not found
 *       500:
 *         description: Server error
 */
router.get('/download/privacy-policy', (req, res) => {
  try {
    const filePath = path.join(__dirname, '../../public/legal/privacy-policy.pdf');
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Privacy Policy document not found'
      });
    }

    // Set headers for download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="SR-Bird-Privacy-Policy.pdf"');
    
    // Send file for download
    res.download(filePath, 'SR-Bird-Privacy-Policy.pdf');
  } catch (error) {
    console.error('Error downloading Privacy Policy:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading Privacy Policy document'
    });
  }
});

/**
 * @swagger
 * /api/v1/legal/download/terms-of-service:
 *   get:
 *     summary: Download Terms of Service document
 *     tags: [Legal]
 *     responses:
 *       200:
 *         description: Terms of Service PDF download
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Terms of Service document not found
 *       500:
 *         description: Server error
 */
router.get('/download/terms-of-service', (req, res) => {
  try {
    const filePath = path.join(__dirname, '../../public/legal/terms-of-service.pdf');
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Terms of Service document not found'
      });
    }

    // Set headers for download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="SR-Bird-Terms-of-Service.pdf"');
    
    // Send file for download
    res.download(filePath, 'SR-Bird-Terms-of-Service.pdf');
  } catch (error) {
    console.error('Error downloading Terms of Service:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading Terms of Service document'
    });
  }
});

/**
 * @swagger
 * /api/v1/legal/info:
 *   get:
 *     summary: Get legal documents information
 *     tags: [Legal]
 *     responses:
 *       200:
 *         description: Legal documents information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     privacyPolicy:
 *                       type: object
 *                       properties:
 *                         available:
 *                           type: boolean
 *                         viewUrl:
 *                           type: string
 *                         downloadUrl:
 *                           type: string
 *                     termsOfService:
 *                       type: object
 *                       properties:
 *                         available:
 *                           type: boolean
 *                         viewUrl:
 *                           type: string
 *                         downloadUrl:
 *                           type: string
 *       500:
 *         description: Server error
 */
router.get('/info', (req, res) => {
  try {
    const baseUrl = `${req.protocol}://${req.get('host')}/api/v1/legal`;
    
    const privacyPolicyPath = path.join(__dirname, '../../public/legal/privacy-policy.pdf');
    const termsOfServicePath = path.join(__dirname, '../../public/legal/terms-of-service.pdf');
    
    const privacyPolicyExists = fs.existsSync(privacyPolicyPath);
    const termsOfServiceExists = fs.existsSync(termsOfServicePath);
    
    res.status(200).json({
      success: true,
      data: {
        privacyPolicy: {
          available: privacyPolicyExists,
          viewUrl: privacyPolicyExists ? `${baseUrl}/privacy-policy` : null,
          downloadUrl: privacyPolicyExists ? `${baseUrl}/download/privacy-policy` : null
        },
        termsOfService: {
          available: termsOfServiceExists,
          viewUrl: termsOfServiceExists ? `${baseUrl}/terms-of-service` : null,
          downloadUrl: termsOfServiceExists ? `${baseUrl}/download/terms-of-service` : null
        },
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting legal documents info:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving legal documents information'
    });
  }
});

module.exports = router;
