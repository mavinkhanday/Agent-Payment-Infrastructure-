const db = require('../config/database');

async function insertDefaultData() {
  try {
    console.log('Checking for default user...');
    
    // Check if we need to insert default user
    const userCount = await db.query('SELECT COUNT(*) FROM users');
    
    if (parseInt(userCount.rows[0].count) === 0) {
      console.log('Creating default user...');
      
      const bcrypt = require('bcryptjs');
      const { v4: uuidv4 } = require('uuid');
      
      const defaultUser = {
        id: uuidv4(),
        email: 'admin@example.com',
        password: await bcrypt.hash('password123', 12),
        company_name: 'Demo Company'
      };
      
      await db.query(
        'INSERT INTO users (id, email, password_hash, company_name) VALUES ($1, $2, $3, $4)',
        [defaultUser.id, defaultUser.email, defaultUser.password, defaultUser.company_name]
      );
      
      // Create default API key
      const apiKey = `ak_${uuidv4().replace(/-/g, '')}`;
      await db.query(
        'INSERT INTO api_keys (user_id, key_name, api_key) VALUES ($1, $2, $3)',
        [defaultUser.id, 'Default Key', apiKey]
      );
      
      console.log(`Default user created!`);
      console.log(`  Email: admin@example.com`);
      console.log(`  Password: password123`);
      console.log(`  API Key: ${apiKey}`);
    } else {
      console.log('Users already exist in database');
      
      // Show existing API keys for reference
      const apiKeys = await db.query('SELECT api_key FROM api_keys WHERE is_active = true LIMIT 1');
      if (apiKeys.rows.length > 0) {
        console.log(`Existing API Key: ${apiKeys.rows[0].api_key}`);
      }
    }
    
    console.log('Data seeding completed successfully');
  } catch (error) {
    console.error('Data seeding failed:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  insertDefaultData()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { insertDefaultData };