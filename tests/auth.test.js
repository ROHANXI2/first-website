const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const User = require('../src/models/User');

// Test database
const MONGODB_TEST_URI = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/sr-bird-tournament-test';

describe('Authentication Endpoints', () => {
  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(MONGODB_TEST_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  });

  beforeEach(async () => {
    // Clear users collection before each test
    await User.deleteMany({});
  });

  afterAll(async () => {
    // Clean up and close connection
    await User.deleteMany({});
    await mongoose.connection.close();
  });

  describe('POST /api/v1/auth/register', () => {
    const validUserData = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'Test123!',
      deviceId: 'test-device-001',
      freeFireId: '123456789',
      freeFireName: 'TestPlayer'
    };

    it('should register a new user with valid data', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(validUserData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user.username).toBe(validUserData.username);
      expect(response.body.data.user.email).toBe(validUserData.email);
      expect(response.body.data.user.password).toBeUndefined();
    });

    it('should not register user with invalid email', async () => {
      const invalidData = { ...validUserData, email: 'invalid-email' };
      
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should not register user with weak password', async () => {
      const invalidData = { ...validUserData, password: '123' };
      
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should not register user with duplicate username', async () => {
      // Create first user
      await request(app)
        .post('/api/v1/auth/register')
        .send(validUserData)
        .expect(201);

      // Try to create second user with same username
      const duplicateData = { 
        ...validUserData, 
        email: 'different@example.com',
        deviceId: 'different-device'
      };
      
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(duplicateData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Username already taken');
    });

    it('should not register user with duplicate email', async () => {
      // Create first user
      await request(app)
        .post('/api/v1/auth/register')
        .send(validUserData)
        .expect(201);

      // Try to create second user with same email
      const duplicateData = { 
        ...validUserData, 
        username: 'differentuser',
        deviceId: 'different-device'
      };
      
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send(duplicateData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Email already registered');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    const userData = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'Test123!',
      deviceId: 'test-device-001'
    };

    beforeEach(async () => {
      // Create a user for login tests
      await request(app)
        .post('/api/v1/auth/register')
        .send(userData);
    });

    it('should login with valid credentials (username)', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          login: userData.username,
          password: userData.password,
          deviceId: userData.deviceId
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user.username).toBe(userData.username);
    });

    it('should login with valid credentials (email)', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          login: userData.email,
          password: userData.password,
          deviceId: userData.deviceId
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user.email).toBe(userData.email);
    });

    it('should not login with invalid password', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          login: userData.username,
          password: 'wrongpassword',
          deviceId: userData.deviceId
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should not login with non-existent user', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          login: 'nonexistent',
          password: userData.password,
          deviceId: userData.deviceId
        })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should not login without required fields', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          login: userData.username
          // Missing password and deviceId
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    let authToken;
    const userData = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'Test123!',
      deviceId: 'test-device-001'
    };

    beforeEach(async () => {
      // Register and login to get token
      const registerResponse = await request(app)
        .post('/api/v1/auth/register')
        .send(userData);
      
      authToken = registerResponse.body.data.token;
    });

    it('should get current user with valid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.username).toBe(userData.username);
      expect(response.body.data.user.email).toBe(userData.email);
      expect(response.body.data.user.password).toBeUndefined();
    });

    it('should not get user without token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Not authorized to access this route');
    });

    it('should not get user with invalid token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Not authorized to access this route');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    let authToken;
    const userData = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'Test123!',
      deviceId: 'test-device-001'
    };

    beforeEach(async () => {
      // Register and login to get token
      const registerResponse = await request(app)
        .post('/api/v1/auth/register')
        .send(userData);
      
      authToken = registerResponse.body.data.token;
    });

    it('should logout with valid token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Logged out successfully');
    });

    it('should not logout without token', async () => {
      const response = await request(app)
        .post('/api/v1/auth/logout')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Not authorized to access this route');
    });
  });
});
