// Seed users were inserted with the placeholder hash 'hash_demo'.
// This sets every user's password to "password123" (bcrypt-hashed)
// so you can log in through the app.
//
// Run once:  npm run seed-passwords

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ecommerce_db',
  });

  const hash = await bcrypt.hash('password123', 10);
  const [result] = await conn.query('UPDATE SystemUser SET PasswordHash = ?', [hash]);
  console.log(`Updated ${result.affectedRows} users. Password for all: password123`);
  await conn.end();
})().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});