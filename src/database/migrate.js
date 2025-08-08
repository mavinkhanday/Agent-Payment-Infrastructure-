const fs = require('fs').promises;
const path = require('path');
const db = require('../config/database');

async function runMigrations() {
  try {
    console.log('Running database migrations...');
    
    // Create migrations tracking table if it doesn't exist
    await db.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get list of migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = await fs.readdir(migrationsDir);
    const migrationFiles = files
      .filter(file => file.endsWith('.sql'))
      .sort(); // Execute in alphabetical order

    for (const filename of migrationFiles) {
      // Check if migration already executed
      const existing = await db.query(
        'SELECT id FROM migrations WHERE filename = $1',
        [filename]
      );

      if (existing.rows.length > 0) {
        console.log(`✓ Migration ${filename} already executed`);
        continue;
      }

      console.log(`→ Executing migration ${filename}...`);
      
      // Read and execute migration
      const migrationPath = path.join(migrationsDir, filename);
      const sql = await fs.readFile(migrationPath, 'utf8');
      
      try {
        await db.query('BEGIN');
        await db.query(sql);
        
        // Record successful migration
        await db.query(
          'INSERT INTO migrations (filename) VALUES ($1)',
          [filename]
        );
        
        await db.query('COMMIT');
        console.log(`✓ Migration ${filename} completed successfully`);
      } catch (error) {
        await db.query('ROLLBACK');
        throw error;
      }
    }

    console.log('All migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Run migrations if called directly
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { runMigrations };
