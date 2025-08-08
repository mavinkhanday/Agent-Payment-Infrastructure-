const fs = require('fs').promises;
const path = require('path');
const db = require('../config/database');

async function initializeDatabase() {
  try {
    console.log('Initializing database...');
    
    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf8');
    
    try {
      await db.query(schema);
      console.log('Database schema created successfully');
    } catch (schemaError) {
      // Ignore "already exists" errors (code 42710, 42P07, etc.)
      if (schemaError.code && (schemaError.code.startsWith('42P') || schemaError.code === '42710')) {
        console.log('Database schema already exists, continuing...');
      } else {
        throw schemaError;
      }
    }
    
    // Run migrations
    const { runMigrations } = require('./migrate');
    await runMigrations();
    
    // Insert default data if needed
    await insertDefaultData();
    
    console.log('Database initialization completed');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}

async function insertDefaultData() {
  try {
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
      
      try {
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
        
        console.log(`Default user created with API key: ${apiKey}`);
      } catch (insertError) {
        if (insertError.code === '23505') {
          console.log('Default user already exists, skipping...');
        } else {
          throw insertError;
        }
      }
    } else {
      console.log('Users already exist in database');
    }
  } catch (error) {
    console.error('Error inserting default data:', error);
    // Don't throw error for default data issues
  }
}

// Run initialization if called directly
if (require.main === module) {
  initializeDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { initializeDatabase, insertDefaultData };