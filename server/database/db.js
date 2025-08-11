import initSqlJs from 'sql.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = path.join(__dirname, 'auth.db');
const INIT_SQL_PATH = path.join(__dirname, 'init.sql');

// Initialize SQL.js and create database connection
const SQL = await initSqlJs();
let db;

// Load existing database or create new one
if (fs.existsSync(DB_PATH)) {
  const filebuffer = fs.readFileSync(DB_PATH);
  db = new SQL.Database(filebuffer);
} else {
  db = new SQL.Database();
}

console.log('Connected to SQLite database');

// Save database to file
const saveDatabase = () => {
  const data = db.export();
  fs.writeFileSync(DB_PATH, data);
};

// Initialize database with schema
const initializeDatabase = async () => {
  try {
    const initSQL = fs.readFileSync(INIT_SQL_PATH, 'utf8');
    db.exec(initSQL);
    saveDatabase();
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error.message);
    throw error;
  }
};

// User database operations
const userDb = {
  // Check if any users exist
  hasUsers: () => {
    try {
      const stmt = db.prepare('SELECT COUNT(*) as count FROM users');
      
      // Try different sql.js methods
      if (stmt.step()) {
        const result = stmt.get();
        console.log('hasUsers result with get():', result); // Debug log
        const count = result[0]; // First column should be the count
        console.log('hasUsers count:', count); // Debug log
        stmt.reset();
        return count > 0;
      }
      
      stmt.reset();
      return false;
    } catch (err) {
      console.log('hasUsers error:', err); // Debug log
      return false; // If table doesn't exist yet, no users
    }
  },

  // Create a new user
  createUser: (username, passwordHash) => {
    try {
      const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
      stmt.run([username, passwordHash]);
      saveDatabase();
      
      // Get the created user
      const getStmt = db.prepare('SELECT id, username FROM users WHERE username = ?');
      const result = getStmt.getAsObject([username]);
      return result;
    } catch (err) {
      throw err;
    }
  },

  // Get user by username
  getUserByUsername: (username) => {
    try {
      const stmt = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1');
      const result = stmt.getAsObject([username]);
      return result.id ? result : null;
    } catch (err) {
      throw err;
    }
  },

  // Update last login time
  updateLastLogin: (userId) => {
    try {
      const stmt = db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?');
      stmt.run([userId]);
      saveDatabase();
    } catch (err) {
      throw err;
    }
  },

  // Get user by ID
  getUserById: (userId) => {
    try {
      const stmt = db.prepare('SELECT id, username, created_at, last_login FROM users WHERE id = ? AND is_active = 1');
      const result = stmt.getAsObject([userId]);
      return result.id ? result : null;
    } catch (err) {
      throw err;
    }
  }
};

export {
  db,
  initializeDatabase,
  userDb
};