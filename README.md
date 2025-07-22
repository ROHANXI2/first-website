# SR Bird Tournament Backend API

A comprehensive, production-ready backend API for the SR Bird Gaming Tournament Platform built with Node.js, Express, MongoDB, and Socket.IO.

## 🚀 Features

### Core Features
- **User Authentication & Authorization** - JWT-based auth with role-based access control
- **Tournament Management** - Complete tournament lifecycle management
- **Match System** - Real-time match management with bracket generation
- **Payment Integration** - Razorpay payment gateway with receipt generation
- **Real-time Communication** - Socket.IO for live updates and chat
- **Admin Dashboard** - Comprehensive admin panel with analytics

### Security Features
- **Rate Limiting** - Configurable rate limits for different endpoints
- **Input Validation** - Comprehensive validation using express-validator
- **Data Sanitization** - XSS protection and input sanitization
- **Security Headers** - Helmet.js for security headers
- **JWT Security** - Secure token management with blacklisting

### Performance Features
- **Redis Caching** - Caching for improved performance
- **Database Indexing** - Optimized MongoDB queries
- **Compression** - Response compression
- **Logging** - Structured logging with Winston

## 📋 Prerequisites

- Node.js (v18.0.0 or higher)
- MongoDB (v5.0 or higher)
- Redis (v6.0 or higher) - Optional but recommended
- Razorpay Account (for payments)

## 🛠️ Installation

### 1. Clone and Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
```

### 2. Environment Configuration

Edit the `.env` file with your configuration:

```env
# Server Configuration
NODE_ENV=development
PORT=5000
API_VERSION=v1

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/sr-bird-tournament

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRE=7d
JWT_REFRESH_SECRET=your-refresh-token-secret
JWT_REFRESH_EXPIRE=30d

# Redis Configuration (Optional)
REDIS_URL=redis://localhost:6379

# Razorpay Configuration
RAZORPAY_KEY_ID=your-razorpay-key-id
RAZORPAY_KEY_SECRET=your-razorpay-key-secret
RAZORPAY_WEBHOOK_SECRET=your-webhook-secret

# Email Configuration
EMAIL_FROM=noreply@srbird.com
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Frontend URL
FRONTEND_URL=http://localhost:3000
```

### 3. Database Setup

```bash
# Start MongoDB service
sudo systemctl start mongod

# Seed the database with sample data
npm run seed
```

### 4. Start the Server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:5000`

## 📚 API Documentation

Once the server is running, visit:
- **Swagger UI**: `http://localhost:5000/api-docs`
- **Health Check**: `http://localhost:5000/health`

## 🔧 Available Scripts

```bash
# Start server in production mode
npm start

# Start server in development mode with nodemon
npm run dev

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Seed database with sample data
npm run seed

# Generate API documentation
npm run docs
```

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/          # Configuration files
│   │   ├── database.js  # MongoDB connection
│   │   ├── redis.js     # Redis connection
│   │   └── swagger.js   # API documentation
│   ├── middleware/      # Express middleware
│   │   ├── auth.js      # Authentication middleware
│   │   ├── errorHandler.js
│   │   ├── notFound.js
│   │   └── validation.js
│   ├── models/          # Mongoose models
│   │   ├── User.js
│   │   ├── Tournament.js
│   │   ├── Match.js
│   │   └── Payment.js
│   ├── routes/          # API routes
│   │   ├── auth.js      # Authentication routes
│   │   ├── users.js     # User management
│   │   ├── tournaments.js
│   │   ├── matches.js
│   │   ├── payments.js
│   │   ├── admin.js
│   │   └── webhooks.js
│   ├── sockets/         # Socket.IO handlers
│   │   └── socketHandler.js
│   └── utils/           # Utility functions
│       ├── logger.js
│       ├── receiptGenerator.js
│       └── bracketGenerator.js
├── scripts/             # Utility scripts
│   └── seedDatabase.js
├── logs/               # Log files
├── receipts/           # Generated receipts
├── server.js           # Main server file
├── package.json
└── README.md
```

## 🔐 Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

### User Roles
- **user**: Regular tournament participants
- **moderator**: Can manage matches and moderate tournaments
- **admin**: Full system access

## 🎮 API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/logout` - User logout
- `GET /api/v1/auth/me` - Get current user
- `POST /api/v1/auth/refresh` - Refresh access token

### Users
- `GET /api/v1/users` - Get all users (admin only)
- `GET /api/v1/users/:id` - Get user profile
- `PUT /api/v1/users/:id` - Update user profile
- `DELETE /api/v1/users/:id` - Delete user account

### Tournaments
- `GET /api/v1/tournaments` - Get all tournaments
- `GET /api/v1/tournaments/:id` - Get tournament details
- `POST /api/v1/tournaments` - Create tournament (admin only)
- `PUT /api/v1/tournaments/:id` - Update tournament (admin only)
- `POST /api/v1/tournaments/:id/register` - Register for tournament
- `DELETE /api/v1/tournaments/:id/register` - Unregister from tournament

### Matches
- `GET /api/v1/matches` - Get matches
- `GET /api/v1/matches/:id` - Get match details
- `POST /api/v1/matches` - Create match (admin/moderator)
- `PUT /api/v1/matches/:id` - Update match
- `POST /api/v1/matches/:id/ready` - Set participant ready status
- `POST /api/v1/matches/:id/start` - Start match
- `POST /api/v1/matches/:id/end` - End match with results

### Payments
- `POST /api/v1/payments/create-order` - Create payment order
- `POST /api/v1/payments/verify-payment` - Verify payment
- `GET /api/v1/payments/:id` - Get payment details
- `GET /api/v1/payments/user/history` - Get user payment history
- `GET /api/v1/payments/:id/receipt` - Download receipt

### Admin
- `GET /api/v1/admin/dashboard` - Dashboard statistics
- `GET /api/v1/admin/users` - User management
- `PUT /api/v1/admin/users/:id` - Update user (admin actions)
- `GET /api/v1/admin/tournaments` - Tournament management
- `POST /api/v1/admin/tournaments/:id/generate-bracket` - Generate bracket
- `GET /api/v1/admin/payments/analytics` - Payment analytics

## 🔌 WebSocket Events

### Connection
- `connected` - Connection confirmation
- `error` - Error messages

### Match Events
- `joinMatch` - Join match room
- `leaveMatch` - Leave match room
- `matchMessage` - Send/receive chat messages
- `setReady` - Set participant ready status
- `participantReady` - Participant ready status update
- `matchStarted` - Match started notification
- `matchEnded` - Match ended notification
- `matchUpdate` - Live match updates

### Tournament Events
- `joinTournament` - Join tournament room
- `tournamentNotification` - Tournament announcements

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- --grep "User"
```

## 📊 Monitoring & Logging

- **Logs**: Stored in `logs/` directory
- **Health Check**: `GET /health`
- **Metrics**: Available through admin dashboard

## 🚀 Deployment

### Production Checklist
1. Set `NODE_ENV=production`
2. Use strong JWT secrets
3. Configure proper MongoDB URI
4. Set up Redis for caching
5. Configure email service
6. Set up Razorpay webhooks
7. Configure CORS for your domain
8. Set up SSL/TLS
9. Configure reverse proxy (Nginx)
10. Set up monitoring and logging

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support, email support@srbird.com or create an issue in the repository.

## 🔄 Version History

- **v1.0.0** - Initial release with core features
  - User authentication and management
  - Tournament system
  - Payment integration
  - Real-time features
  - Admin dashboard
