const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const dotenv = require('dotenv');

// Locate backend root directory (parent of src)
const backendDir = path.resolve(__dirname, '..', '..');

// Load environment variables from backend/.env if present
dotenv.config({ path: path.join(backendDir, '.env') });

const dbRelativePath = process.env.DATABASE_PATH || 'database/expense-tracker.db';
const dbPath = path.resolve(backendDir, dbRelativePath);

// Ensure the directory for the database file exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Connect to SQLite database
const db = new Database(dbPath);

// Enable WAL mode for better concurrency and performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize database schema from schema.sql
const schemaPath = path.resolve(backendDir, 'database', 'schema.sql');
if (fs.existsSync(schemaPath)) {
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schemaSql);
} else {
  console.warn('Warning: schema.sql not found at', schemaPath);
}

module.exports = db;
