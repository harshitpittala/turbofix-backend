/**
 * database.js — PostgreSQL connection pool (Supabase)
 */

const { Pool } = require('pg');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';
const useSSL       = isProduction || process.env.DB_SSL === 'true';

// Support both a full DATABASE_URL or individual DB_* params
const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: useSSL ? { rejectUnauthorized: false } : false,
    }
  : {
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME     || 'postgres',
      user:     process.env.DB_USER     || 'postgres',
      password: process.env.DB_PASSWORD || '',
      ssl:      useSSL ? { rejectUnauthorized: false } : false,
    };

const pool = new Pool({
  ...poolConfig,
  max:                  10,
  idleTimeoutMillis:    30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle pg client:', err.message);
});

(async () => {
  try {
    const client = await pool.connect();
    console.log('✅ PostgreSQL (Supabase) connected successfully');
    client.release();
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  }
})();

module.exports = pool;
