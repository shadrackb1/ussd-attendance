require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function migrate(direction = 'up') {
  const client = await pool.connect();
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    if (direction === 'up') {
      await client.query(sql);
      console.log('Migration applied successfully.');
    } else {
      // Drop tables in reverse dependency order
      const dropOrder = [
        'attendance_records',
        'sessions',
        'students',
        'units',
        'lecturers',
      ];
      for (const table of dropOrder) {
        await client.query(`DROP TABLE IF EXISTS ${table} CASCADE;`);
      }
      console.log('Migration rolled back successfully.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

const direction = process.argv[2] || 'up';
migrate(direction).catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
