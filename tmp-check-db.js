const { Client } = require('pg');
require('dotenv').config();

const db = process.env.CHECK_DATABASE || process.env.DB_DATABASE;
const base = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
};

async function main() {
  const admin = new Client({ ...base, database: 'postgres' });
  await admin.connect();
  const exists = await admin.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [db],
  );
  console.log('database', db, 'exists', exists.rowCount > 0);
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${db.replace(/"/g, '""')}"`);
    console.log('created', db);
  }
  await admin.end();

  const app = new Client({ ...base, database: db });
  await app.connect();
  const tables = await app.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  );
  console.log(
    'public_tables',
    tables.rows.map((row) => row.tablename).join(',') || '(none)',
  );
  await app.end();
}

main().catch((error) => {
  console.error('DB_ERROR');
  console.error(error);
  process.exit(1);
});
