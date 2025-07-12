# FF Tournament Backend

Backend API for FF Tournament Registration System

## 🚀 Deploy to Render

1. **Push this repository to GitHub**
2. **Connect to Render:**
   - Go to [Render Dashboard](https://render.com)
   - Create new Web Service
   - Connect your GitHub repository

3. **Configure Render Settings:**
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Node Version:** 18.x

4. **Set Environment Variables in Render:**
   ```
   AIRTABLE_API_KEY=your_airtable_api_key
   AIRTABLE_BASE_ID=your_airtable_base_id
   RAZORPAY_KEY_ID=your_razorpay_key_id
   RAZORPAY_KEY_SECRET=your_razorpay_key_secret
   NODE_ENV=production
   ```

## 📋 API Endpoints

- `POST /api/create-razorpay-order` - Create payment order
- `POST /api/generate-receipt` - Generate receipt
- `POST /api/generate-token` - Generate player token
- `GET /api/get-razorpay-key` - Get Razorpay public key
- `GET /api/get-registrations` - Get registration data
- `POST /api/razorpay-webhook` - Payment webhook
- `POST /api/verify-razorpay-payment` - Verify payment
- `POST /api/ban-player` - Ban a player
- `POST /api/check-ban` - Check if player is banned
- `GET /api/get-bans` - Get ban list
- `GET /api/get-bans-simple` - Get simple ban list
- `GET /health` - Health check

## 🔧 Local Development

```bash
npm install
npm run dev
```

Server runs on http://localhost:3000
