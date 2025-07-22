#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 SR Bird Tournament Backend Installation Script');
console.log('================================================\n');

// Check Node.js version
const nodeVersion = process.version;
const requiredVersion = 'v18.0.0';

console.log(`📋 Checking Node.js version...`);
console.log(`   Current: ${nodeVersion}`);
console.log(`   Required: ${requiredVersion} or higher`);

if (nodeVersion < requiredVersion) {
  console.error(`❌ Node.js ${requiredVersion} or higher is required`);
  process.exit(1);
}
console.log('✅ Node.js version check passed\n');

// Check if .env file exists
console.log('📋 Checking environment configuration...');
const envPath = path.join(__dirname, '../.env');
const envExamplePath = path.join(__dirname, '../.env.example');

if (!fs.existsSync(envPath)) {
  if (fs.existsSync(envExamplePath)) {
    console.log('📝 Creating .env file from .env.example...');
    fs.copyFileSync(envExamplePath, envPath);
    console.log('✅ .env file created');
    console.log('⚠️  Please edit .env file with your configuration before starting the server');
  } else {
    console.error('❌ .env.example file not found');
    process.exit(1);
  }
} else {
  console.log('✅ .env file already exists');
}
console.log('');

// Create required directories
console.log('📁 Creating required directories...');
const directories = ['logs', 'receipts', 'uploads'];

directories.forEach(dir => {
  const dirPath = path.join(__dirname, `../${dir}`);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`✅ Created ${dir}/ directory`);
  } else {
    console.log(`✅ ${dir}/ directory already exists`);
  }
});
console.log('');

// Check MongoDB connection
console.log('🔍 Checking MongoDB connection...');
try {
  // This is a basic check - in a real scenario, you'd want to test the actual connection
  console.log('⚠️  Please ensure MongoDB is running on your system');
  console.log('   - Install MongoDB: https://docs.mongodb.com/manual/installation/');
  console.log('   - Start MongoDB service: sudo systemctl start mongod');
  console.log('   - Or use MongoDB Atlas for cloud database');
} catch (error) {
  console.log('⚠️  Could not verify MongoDB connection');
}
console.log('');

// Check Redis (optional)
console.log('🔍 Checking Redis (optional)...');
try {
  console.log('ℹ️  Redis is optional but recommended for caching');
  console.log('   - Install Redis: https://redis.io/download');
  console.log('   - Start Redis service: sudo systemctl start redis');
  console.log('   - Or comment out REDIS_URL in .env to disable caching');
} catch (error) {
  console.log('⚠️  Redis not detected (optional)');
}
console.log('');

// Installation summary
console.log('📋 Installation Summary');
console.log('======================');
console.log('✅ Node.js version check passed');
console.log('✅ Environment file configured');
console.log('✅ Required directories created');
console.log('');

console.log('🔧 Next Steps:');
console.log('1. Edit .env file with your configuration:');
console.log('   - MongoDB connection string');
console.log('   - JWT secrets (generate strong random strings)');
console.log('   - Razorpay credentials (for payments)');
console.log('   - Email configuration (for notifications)');
console.log('');
console.log('2. Install dependencies:');
console.log('   npm install');
console.log('');
console.log('3. Seed the database (optional):');
console.log('   npm run seed');
console.log('');
console.log('4. Start the development server:');
console.log('   npm run dev');
console.log('');
console.log('5. Visit the API documentation:');
console.log('   http://localhost:5000/api-docs');
console.log('');

console.log('🎮 Default Admin Credentials (after seeding):');
console.log('   Email: admin@srbird.com');
console.log('   Password: Admin123!');
console.log('');

console.log('📚 Documentation:');
console.log('   - README.md for detailed setup instructions');
console.log('   - API documentation at /api-docs endpoint');
console.log('   - Environment variables in .env.example');
console.log('');

console.log('🆘 Support:');
console.log('   - GitHub Issues: Create an issue for bugs or questions');
console.log('   - Email: support@srbird.com');
console.log('');

console.log('🎉 Installation script completed!');
console.log('   Please follow the next steps above to complete the setup.');
