const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import models
const User = require('../src/models/User');
const Tournament = require('../src/models/Tournament');
const Match = require('../src/models/Match');
const Payment = require('../src/models/Payment');

// Connect to database
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB Connected for seeding');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
};

// Sample data
const sampleUsers = [
  {
    username: 'admin',
    email: 'admin@srbird.com',
    password: 'Admin123!',
    role: 'admin',
    deviceId: 'admin-device-001',
    profile: {
      firstName: 'Admin',
      lastName: 'User',
      country: 'India'
    },
    gaming: {
      freeFireId: '123456789',
      freeFireName: 'AdminPlayer',
      rank: 'Grandmaster',
      level: 80,
      kd: 5.2,
      winRate: 85
    },
    isVerified: true,
    isActive: true
  },
  {
    username: 'moderator1',
    email: 'mod1@srbird.com',
    password: 'Mod123!',
    role: 'moderator',
    deviceId: 'mod-device-001',
    profile: {
      firstName: 'John',
      lastName: 'Moderator',
      country: 'India'
    },
    gaming: {
      freeFireId: '987654321',
      freeFireName: 'ModPlayer1',
      rank: 'Master',
      level: 75,
      kd: 4.1,
      winRate: 78
    },
    isVerified: true,
    isActive: true
  },
  {
    username: 'player1',
    email: 'player1@example.com',
    password: 'Player123!',
    role: 'user',
    deviceId: 'player-device-001',
    profile: {
      firstName: 'Raj',
      lastName: 'Kumar',
      country: 'India'
    },
    gaming: {
      freeFireId: '111222333',
      freeFireName: 'RajGamer',
      rank: 'Diamond',
      level: 65,
      kd: 3.2,
      winRate: 72
    },
    isVerified: true,
    isActive: true
  },
  {
    username: 'player2',
    email: 'player2@example.com',
    password: 'Player123!',
    role: 'user',
    deviceId: 'player-device-002',
    profile: {
      firstName: 'Priya',
      lastName: 'Sharma',
      country: 'India'
    },
    gaming: {
      freeFireId: '444555666',
      freeFireName: 'PriyaFF',
      rank: 'Platinum',
      level: 58,
      kd: 2.8,
      winRate: 68
    },
    isVerified: true,
    isActive: true
  },
  {
    username: 'player3',
    email: 'player3@example.com',
    password: 'Player123!',
    role: 'user',
    deviceId: 'player-device-003',
    profile: {
      firstName: 'Arjun',
      lastName: 'Singh',
      country: 'India'
    },
    gaming: {
      freeFireId: '777888999',
      freeFireName: 'ArjunPro',
      rank: 'Gold',
      level: 52,
      kd: 2.1,
      winRate: 61
    },
    isVerified: true,
    isActive: true
  }
];

const sampleTournaments = [
  {
    title: 'SR Bird Weekly Championship',
    description: 'Weekly Free Fire tournament with exciting prizes. Show your skills and compete with the best players!',
    gameType: 'Free Fire',
    tournamentType: '1v1',
    maxParticipants: 32,
    entryFee: 30,
    currency: 'INR',
    prizePool: {
      total: 800,
      distribution: [
        { position: 1, amount: 400, percentage: 50 },
        { position: 2, amount: 240, percentage: 30 },
        { position: 3, amount: 160, percentage: 20 }
      ]
    },
    registrationStart: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000), // Tomorrow
    registrationEnd: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
    tournamentStart: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000), // 4 days from now
    tournamentEnd: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
    status: 'upcoming',
    isPublished: true,
    isFeatured: true,
    rules: [
      'No cheating or hacking allowed',
      'Respect all participants',
      'Follow tournament schedule',
      'Use only allowed devices'
    ],
    requirements: {
      minLevel: 20,
      minRank: 'Bronze',
      regions: ['India'],
      deviceRestrictions: ['Android', 'iOS']
    },
    settings: {
      autoStart: false,
      allowLateRegistration: false,
      requireApproval: false,
      showBracket: true,
      allowSpectators: true
    }
  },
  {
    title: 'Free Fire Squad Battle',
    description: 'Epic 4v4 squad tournament. Team up with your friends and dominate the battlefield!',
    gameType: 'Free Fire',
    tournamentType: '4v4',
    maxParticipants: 16,
    entryFee: 50,
    currency: 'INR',
    prizePool: {
      total: 600,
      distribution: [
        { position: 1, amount: 300, percentage: 50 },
        { position: 2, amount: 180, percentage: 30 },
        { position: 3, amount: 120, percentage: 20 }
      ]
    },
    registrationStart: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    registrationEnd: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    tournamentStart: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
    tournamentEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    status: 'upcoming',
    isPublished: true,
    isFeatured: false,
    rules: [
      'Squad members must be registered',
      'No substitutions during matches',
      'Fair play required',
      'Report any issues immediately'
    ],
    requirements: {
      minLevel: 30,
      minRank: 'Silver',
      regions: ['India'],
      deviceRestrictions: ['Android', 'iOS']
    }
  }
];

// Seed functions
const seedUsers = async () => {
  try {
    console.log('🌱 Seeding users...');
    
    // Clear existing users
    await User.deleteMany({});
    
    // Hash passwords and create users
    const users = [];
    for (const userData of sampleUsers) {
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(userData.password, salt);
      
      users.push({
        ...userData,
        password: hashedPassword
      });
    }
    
    const createdUsers = await User.insertMany(users);
    console.log(`✅ Created ${createdUsers.length} users`);
    
    return createdUsers;
  } catch (error) {
    console.error('❌ Error seeding users:', error);
    throw error;
  }
};

const seedTournaments = async (users) => {
  try {
    console.log('🌱 Seeding tournaments...');
    
    // Clear existing tournaments
    await Tournament.deleteMany({});
    
    // Find admin user to be the organizer
    const adminUser = users.find(user => user.role === 'admin');
    
    const tournaments = sampleTournaments.map(tournamentData => ({
      ...tournamentData,
      organizer: adminUser._id
    }));
    
    const createdTournaments = await Tournament.insertMany(tournaments);
    console.log(`✅ Created ${createdTournaments.length} tournaments`);
    
    return createdTournaments;
  } catch (error) {
    console.error('❌ Error seeding tournaments:', error);
    throw error;
  }
};

const seedDatabase = async () => {
  try {
    console.log('🚀 Starting database seeding...');
    
    await connectDB();
    
    // Seed in order
    const users = await seedUsers();
    const tournaments = await seedTournaments(users);
    
    console.log('✅ Database seeding completed successfully!');
    console.log('\n📊 Seeded Data Summary:');
    console.log(`   Users: ${users.length}`);
    console.log(`   Tournaments: ${tournaments.length}`);
    console.log('\n🔑 Admin Credentials:');
    console.log('   Email: admin@srbird.com');
    console.log('   Password: Admin123!');
    console.log('\n🎮 Test Player Credentials:');
    console.log('   Email: player1@example.com');
    console.log('   Password: Player123!');
    
  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
    process.exit(0);
  }
};

// Run seeding if called directly
if (require.main === module) {
  seedDatabase();
}

module.exports = {
  seedDatabase,
  seedUsers,
  seedTournaments
};
