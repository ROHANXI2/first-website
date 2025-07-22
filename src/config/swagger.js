const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SR Bird Tournament API',
      version: '1.0.0',
      description: 'Comprehensive API for SR Bird Gaming Tournament Platform',
      contact: {
        name: 'SR Bird Team',
        email: 'support@srbird.com',
        url: 'https://srbird.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: process.env.NODE_ENV === 'production' 
          ? 'https://api.srbird.com/api/v1' 
          : `http://localhost:${process.env.PORT || 5000}/api/v1`,
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token for authentication'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            username: { type: 'string', minLength: 3, maxLength: 30 },
            email: { type: 'string', format: 'email' },
            role: { type: 'string', enum: ['user', 'moderator', 'admin'] },
            profile: {
              type: 'object',
              properties: {
                firstName: { type: 'string', maxLength: 50 },
                lastName: { type: 'string', maxLength: 50 },
                avatar: { type: 'string', format: 'uri' },
                bio: { type: 'string', maxLength: 500 },
                country: { type: 'string' },
                phoneNumber: { type: 'string' }
              }
            },
            gaming: {
              type: 'object',
              properties: {
                freeFireId: { type: 'string', pattern: '^[0-9]{8,12}$' },
                freeFireName: { type: 'string', maxLength: 20 },
                rank: { type: 'string', enum: ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Grandmaster', 'Heroic'] },
                level: { type: 'integer', minimum: 1, maximum: 80 },
                kd: { type: 'number', minimum: 0 },
                winRate: { type: 'number', minimum: 0, maximum: 100 }
              }
            },
            stats: {
              type: 'object',
              properties: {
                tournamentsPlayed: { type: 'integer', minimum: 0 },
                tournamentsWon: { type: 'integer', minimum: 0 },
                totalEarnings: { type: 'number', minimum: 0 },
                currentStreak: { type: 'integer', minimum: 0 },
                bestStreak: { type: 'integer', minimum: 0 }
              }
            },
            isVerified: { type: 'boolean' },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Tournament: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string', maxLength: 100 },
            description: { type: 'string', maxLength: 1000 },
            gameType: { type: 'string', enum: ['Free Fire', 'PUBG Mobile', 'Call of Duty Mobile', 'Valorant Mobile'] },
            tournamentType: { type: 'string', enum: ['1v1', '2v2', '4v4', 'Squad', 'Battle Royale', 'Custom'] },
            maxParticipants: { type: 'integer', minimum: 2, maximum: 1000 },
            entryFee: { type: 'number', minimum: 0 },
            currency: { type: 'string', enum: ['INR', 'USD', 'EUR'] },
            prizePool: {
              type: 'object',
              properties: {
                total: { type: 'number', minimum: 0 },
                distribution: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      position: { type: 'integer', minimum: 1 },
                      amount: { type: 'number', minimum: 0 },
                      percentage: { type: 'number', minimum: 0, maximum: 100 }
                    }
                  }
                }
              }
            },
            registrationStart: { type: 'string', format: 'date-time' },
            registrationEnd: { type: 'string', format: 'date-time' },
            tournamentStart: { type: 'string', format: 'date-time' },
            tournamentEnd: { type: 'string', format: 'date-time' },
            status: { type: 'string', enum: ['draft', 'upcoming', 'registration_open', 'registration_closed', 'ongoing', 'completed', 'cancelled'] },
            isPublished: { type: 'boolean' },
            isFeatured: { type: 'boolean' },
            currentParticipants: { type: 'integer', minimum: 0 },
            availableSpots: { type: 'integer', minimum: 0 },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Match: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            tournament: { $ref: '#/components/schemas/Tournament' },
            matchNumber: { type: 'integer', minimum: 1 },
            round: { type: 'integer', minimum: 1 },
            bracketPosition: { type: 'string' },
            participants: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  user: { $ref: '#/components/schemas/User' },
                  teamName: { type: 'string' },
                  seed: { type: 'integer' },
                  status: { type: 'string', enum: ['ready', 'not_ready', 'disconnected', 'disqualified'] }
                }
              }
            },
            status: { type: 'string', enum: ['scheduled', 'ready', 'ongoing', 'paused', 'completed', 'cancelled', 'disputed'] },
            gameMode: { type: 'string', enum: ['1v1', '2v2', '4v4', 'Squad', 'Battle Royale', 'Custom'] },
            scheduledAt: { type: 'string', format: 'date-time' },
            startedAt: { type: 'string', format: 'date-time' },
            endedAt: { type: 'string', format: 'date-time' },
            winner: { $ref: '#/components/schemas/User' },
            result: { type: 'string', enum: ['player1_win', 'player2_win', 'draw', 'no_contest', 'disputed'] },
            createdAt: { type: 'string', format: 'date-time' }
          }
        },
        Payment: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user: { $ref: '#/components/schemas/User' },
            tournament: { $ref: '#/components/schemas/Tournament' },
            amount: { type: 'number', minimum: 0 },
            currency: { type: 'string', enum: ['INR', 'USD', 'EUR'] },
            paymentGateway: { type: 'string', enum: ['razorpay', 'stripe', 'paypal', 'manual'] },
            paymentMethod: { type: 'string', enum: ['card', 'netbanking', 'wallet', 'upi', 'bank_transfer', 'cash'] },
            status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded', 'disputed'] },
            transactionId: { type: 'string' },
            receiptNumber: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            completedAt: { type: 'string', format: 'date-time' }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string' },
            details: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' },
                  value: { type: 'string' }
                }
              }
            }
          }
        },
        Success: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string' },
            data: { type: 'object' }
          }
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            total: { type: 'integer', minimum: 0 },
            pages: { type: 'integer', minimum: 0 }
          }
        }
      },
      responses: {
        BadRequest: {
          description: 'Bad Request',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        },
        Unauthorized: {
          description: 'Unauthorized',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        },
        Forbidden: {
          description: 'Forbidden',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        },
        NotFound: {
          description: 'Not Found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        },
        TooManyRequests: {
          description: 'Too Many Requests',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        },
        InternalServerError: {
          description: 'Internal Server Error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' }
            }
          }
        }
      },
      parameters: {
        PageParam: {
          name: 'page',
          in: 'query',
          description: 'Page number for pagination',
          schema: { type: 'integer', minimum: 1, default: 1 }
        },
        LimitParam: {
          name: 'limit',
          in: 'query',
          description: 'Number of items per page',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
        },
        SearchParam: {
          name: 'search',
          in: 'query',
          description: 'Search term',
          schema: { type: 'string', minLength: 1, maxLength: 100 }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ],
    tags: [
      {
        name: 'Authentication',
        description: 'User authentication and authorization'
      },
      {
        name: 'Users',
        description: 'User management and profiles'
      },
      {
        name: 'Tournaments',
        description: 'Tournament management and registration'
      },
      {
        name: 'Matches',
        description: 'Match management and results'
      },
      {
        name: 'Payments',
        description: 'Payment processing and receipts'
      },
      {
        name: 'Admin',
        description: 'Administrative functions'
      },
      {
        name: 'Webhooks',
        description: 'Webhook endpoints for external integrations'
      }
    ]
  },
  apis: [
    './src/routes/*.js', // Path to the API routes
    './src/models/*.js'  // Path to the models for schema definitions
  ]
};

const specs = swaggerJsdoc(options);

const swaggerOptions = {
  customCss: `
    .swagger-ui .topbar { display: none }
    .swagger-ui .info .title { color: #00f2ff }
    .swagger-ui .scheme-container { background: #0a0a1a; border: 1px solid #00f2ff }
  `,
  customSiteTitle: 'SR Bird Tournament API Documentation',
  customfavIcon: '/favicon.ico'
};

module.exports = {
  specs,
  swaggerUi,
  swaggerOptions
};
