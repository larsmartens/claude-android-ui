# Database Layer Documentation

## Overview

The database layer implements a lightweight, Android/Termux-compatible authentication system using sql.js, a pure JavaScript implementation of SQLite. This approach eliminates native compilation requirements while providing full SQL functionality.

## Database Architecture

### Technology Stack

#### sql.js Implementation
```javascript
import initSqlJs from 'sql.js';

// Initialize SQL.js engine
const SQL = await initSqlJs();

// Create or load database
const db = fs.existsSync(DB_PATH) 
    ? new SQL.Database(fs.readFileSync(DB_PATH))
    : new SQL.Database();
```

#### File Persistence
- **Database File**: `server/database/auth.db`
- **Schema File**: `server/database/init.sql`
- **Manual Persistence**: Database changes saved to disk after each operation

### Database Schema

#### Users Table
```sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    is_active BOOLEAN DEFAULT 1
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
```

#### Single-User System Design
- **Constraint**: Only one active user allowed
- **Purpose**: Simplified authentication for personal Claude CLI usage
- **Validation**: User creation blocked if users exist

## Database Operations (db.js)

### Initialization System

#### Database Loading
```javascript
// Load existing database or create new one
if (fs.existsSync(DB_PATH)) {
    const filebuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(filebuffer);
} else {
    db = new SQL.Database();
}
```

#### Schema Application
```javascript
const initializeDatabase = async () => {
    try {
        const initSQL = fs.readFileSync(INIT_SQL_PATH, 'utf8');
        db.exec(initSQL);
        saveDatabase(); // Persist to disk
        console.log('Database initialized successfully');
    } catch (error) {
        console.error('Error initializing database:', error.message);
        throw error;
    }
};
```

### Persistence Management

#### Manual Save System
```javascript
const saveDatabase = () => {
    const data = db.export();
    fs.writeFileSync(DB_PATH, data);
};
```

#### Save Triggers
- After user creation
- After login updates
- After any database modifications
- During database initialization

### User Management API

#### User Existence Check
```javascript
hasUsers: () => {
    try {
        const stmt = db.prepare('SELECT COUNT(*) as count FROM users');
        
        if (stmt.step()) {
            const result = stmt.get();
            const count = result[0]; // First column contains count
            stmt.reset();
            return count > 0;
        }
        
        stmt.reset();
        return false;
    } catch (err) {
        console.log('hasUsers error:', err);
        return false; // If table doesn't exist yet, no users
    }
}
```

#### User Creation
```javascript
createUser: (username, passwordHash) => {
    try {
        const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
        stmt.run([username, passwordHash]);
        saveDatabase(); // Persist changes
        
        // Return created user
        const getStmt = db.prepare('SELECT id, username FROM users WHERE username = ?');
        const result = getStmt.getAsObject([username]);
        return result;
    } catch (err) {
        throw err;
    }
}
```

#### User Authentication
```javascript
getUserByUsername: (username) => {
    try {
        const stmt = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1');
        const result = stmt.getAsObject([username]);
        return result.id ? result : null; // Return user or null
    } catch (err) {
        throw err;
    }
}
```

#### Session Management
```javascript
updateLastLogin: (userId) => {
    try {
        const stmt = db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?');
        stmt.run([userId]);
        saveDatabase(); // Persist login time
    } catch (err) {
        throw err;
    }
}
```

## sql.js API Patterns

### Query Execution

#### Prepared Statements
```javascript
// Prepare statement
const stmt = db.prepare('SELECT * FROM users WHERE username = ?');

// Execute with parameters
const result = stmt.getAsObject([username]);

// Always reset after use
stmt.reset();
```

#### Step-based Execution
```javascript
const stmt = db.prepare('SELECT COUNT(*) as count FROM users');

if (stmt.step()) {
    const result = stmt.get(); // Returns array of values
    const count = result[0];   // First column
    stmt.reset();
    return count > 0;
}
```

### Data Retrieval Methods

#### getAsObject()
```javascript
const result = stmt.getAsObject(); // Returns object with column names
// Example: { id: 1, username: 'john', created_at: '2024-01-01' }
```

#### get()
```javascript
const result = stmt.get(); // Returns array of values
// Example: [1, 'john', 'hash123', '2024-01-01', null, 1]
```

#### exec()
```javascript
db.exec(sqlString); // Execute SQL string directly
// Used for schema initialization and bulk operations
```

## Error Handling

### Database Error Types

#### Connection Errors
```javascript
catch (err) {
    if (err.message.includes('no such table')) {
        // Table doesn't exist - reinitialize database
        await initializeDatabase();
    } else {
        console.error('Database connection error:', err);
        throw new Error('Database unavailable');
    }
}
```

#### Constraint Violations
```javascript
catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
        throw new Error('Username already exists');
    } else {
        console.error('Database constraint error:', err);
        throw err;
    }
}
```

#### File System Errors
```javascript
catch (err) {
    if (err.code === 'EACCES') {
        console.error('Database file permission denied');
        throw new Error('Database access denied');
    } else if (err.code === 'ENOSPC') {
        console.error('Insufficient disk space for database');
        throw new Error('Disk space unavailable');
    }
}
```

### Recovery Strategies

#### Database Corruption
```javascript
const handleCorruption = async () => {
    console.warn('Database corruption detected, recreating...');
    
    // Backup corrupted file
    if (fs.existsSync(DB_PATH)) {
        fs.renameSync(DB_PATH, DB_PATH + '.corrupted.' + Date.now());
    }
    
    // Create fresh database
    db = new SQL.Database();
    await initializeDatabase();
};
```

#### File Lock Issues
```javascript
const saveWithRetry = async (retries = 3) => {
    for (let i = 0; i < retries; i++) {
        try {
            saveDatabase();
            return;
        } catch (err) {
            if (i === retries - 1) throw err;
            await new Promise(resolve => setTimeout(resolve, 100 * (i + 1)));
        }
    }
};
```

## Performance Optimizations

### Memory Management

#### Database Size Monitoring
```javascript
const getDatabaseSize = () => {
    try {
        const stats = fs.statSync(DB_PATH);
        return stats.size;
    } catch {
        return 0;
    }
};

// Log size for monitoring
console.log(`Database size: ${getDatabaseSize()} bytes`);
```

#### Statement Reuse
```javascript
// Cache prepared statements for frequent operations
const statementCache = new Map();

const getCachedStatement = (sql) => {
    if (!statementCache.has(sql)) {
        statementCache.set(sql, db.prepare(sql));
    }
    return statementCache.get(sql);
};
```

### Query Optimization

#### Index Usage
```sql
-- Indexes defined in init.sql
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
```

#### Efficient Queries
```javascript
// Use specific columns instead of SELECT *
const stmt = db.prepare('SELECT id, username, created_at FROM users WHERE username = ?');

// Use LIMIT for large result sets
const stmt = db.prepare('SELECT * FROM users ORDER BY last_login DESC LIMIT 10');
```

## Android/Termux Adaptations

### File System Considerations

#### Path Handling
```javascript
const DB_PATH = path.join(__dirname, 'auth.db');
const INIT_SQL_PATH = path.join(__dirname, 'init.sql');

// Use relative paths within server directory
// Avoid system-wide paths that may not exist
```

#### Permission Management
```javascript
// Ensure directory exists and is writable
const ensureDbDirectory = async () => {
    const dbDir = path.dirname(DB_PATH);
    try {
        await fs.promises.mkdir(dbDir, { recursive: true });
        await fs.promises.access(dbDir, fs.constants.W_OK);
    } catch (err) {
        throw new Error('Database directory not accessible');
    }
};
```

### Resource Constraints

#### Memory Efficiency
```javascript
// Immediate statement cleanup
stmt.reset();
stmt = null;

// Periodic garbage collection hint
if (global.gc && operationCount % 100 === 0) {
    global.gc();
}
```

#### Storage Optimization
```javascript
// Compact database periodically
const compactDatabase = () => {
    try {
        db.exec('VACUUM;');
        saveDatabase();
        console.log('Database compacted successfully');
    } catch (err) {
        console.error('Database compaction failed:', err);
    }
};
```

## Security Considerations

### Data Protection

#### Password Hashing
```javascript
// Never store plain text passwords
const bcrypt = require('bcryptjs');
const saltRounds = 12;

const passwordHash = await bcrypt.hash(password, saltRounds);
// Store passwordHash, never store password
```

#### SQL Injection Prevention
```javascript
// Always use parameterized queries
const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
const result = stmt.getAsObject([username]); // Parameter binding

// NEVER use string concatenation
// BAD: db.exec(`SELECT * FROM users WHERE username = '${username}'`);
```

### Access Control

#### Database File Permissions
```javascript
// Set restrictive permissions on database file
const setDatabasePermissions = () => {
    try {
        fs.chmodSync(DB_PATH, 0o600); // Owner read/write only
    } catch (err) {
        console.warn('Could not set database permissions:', err.message);
    }
};
```

#### Backup Security
```javascript
// Secure backup creation
const createSecureBackup = () => {
    const backupPath = DB_PATH + '.backup.' + Date.now();
    fs.copyFileSync(DB_PATH, backupPath);
    fs.chmodSync(backupPath, 0o600); // Maintain restrictive permissions
    return backupPath;
};
```

## Maintenance and Monitoring

### Health Checks

#### Database Integrity
```javascript
const checkIntegrity = () => {
    try {
        const result = db.exec('PRAGMA integrity_check;');
        return result[0]?.values[0]?.[0] === 'ok';
    } catch {
        return false;
    }
};
```

#### Connection Testing
```javascript
const testConnection = () => {
    try {
        const stmt = db.prepare('SELECT 1');
        const result = stmt.step();
        stmt.reset();
        return result;
    } catch {
        return false;
    }
};
```

### Backup Strategies

#### Automatic Backups
```javascript
const createPeriodicBackup = () => {
    setInterval(() => {
        try {
            const backupPath = createSecureBackup();
            console.log(`Database backup created: ${backupPath}`);
            
            // Cleanup old backups (keep last 5)
            cleanupOldBackups();
        } catch (err) {
            console.error('Backup creation failed:', err);
        }
    }, 24 * 60 * 60 * 1000); // Daily backups
};
```

---

*This database layer provides a robust, secure, and efficient authentication system optimized for Android/Termux environments while maintaining compatibility with all SQL features needed for the application.*