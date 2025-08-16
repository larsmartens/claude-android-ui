# API Routes Documentation

## Overview

The routes directory contains all API endpoint handlers for the Claude Code UI backend. Each route module focuses on a specific domain of functionality, providing RESTful APIs and specialized endpoints for various features.

## Route Structure

```
server/routes/
├── auth.js          # Authentication and user management
├── git.js           # Git operations and repository management
├── mcp.js           # Model Context Protocol configuration
└── cursor.js        # Cursor CLI integration (v1.7.0)
```

## Authentication Routes (auth.js)

### Route Configuration
```javascript
import { authenticateToken } from '../middleware/auth.js';

// Public routes
router.get('/status', ...)     // Authentication status check
router.post('/register', ...)  // User registration (setup)
router.post('/login', ...)     // User authentication

// Protected routes
router.get('/user', authenticateToken, ...)    // Current user info
router.post('/logout', authenticateToken, ...) // Session termination
```

### Authentication Flow

#### Status Check Endpoint
```javascript
GET /api/auth/status
Response: {
    "needsSetup": boolean,      // Whether initial setup is required
    "isAuthenticated": boolean  // Client-side token status
}
```

Purpose: Determine if the application needs initial user setup or if the user is already authenticated.

#### User Registration (Setup)
```javascript
POST /api/auth/register
Body: {
    "username": string (min 3 chars),
    "password": string (min 6 chars)
}

Response: {
    "success": true,
    "user": { "id": number, "username": string },
    "token": string (JWT)
}
```

Features:
- **Single-user constraint**: Only allows registration if no users exist
- **Transaction safety**: Database rollback on errors
- **Password hashing**: bcryptjs with 12 salt rounds
- **Immediate authentication**: Returns JWT token for immediate login

#### User Login
```javascript
POST /api/auth/login
Body: {
    "username": string,
    "password": string
}

Response: {
    "success": true,
    "user": { "id": number, "username": string },
    "token": string (JWT)
}
```

Security features:
- **Password verification**: bcryptjs compare with stored hash
- **Login tracking**: Updates last_login timestamp
- **Error handling**: Generic error messages to prevent username enumeration

### Error Handling Patterns

#### Validation Errors
```javascript
if (!username || !password) {
    return res.status(400).json({ 
        error: 'Username and password are required' 
    });
}

if (username.length < 3 || password.length < 6) {
    return res.status(400).json({ 
        error: 'Username must be at least 3 characters, password at least 6 characters' 
    });
}
```

#### Database Errors
```javascript
catch (error) {
    console.error('Registration error:', error);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        res.status(409).json({ error: 'Username already exists' });
    } else {
        res.status(500).json({ error: 'Internal server error' });
    }
}
```

## Git Operations Routes (git.js)

### Route Protection
```javascript
// All git routes require authentication
router.use(authenticateToken);
```

### Git Status and Information

#### Repository Status
```javascript
GET /api/git/:projectName/status
Response: {
    "currentBranch": string,
    "status": {
        "staged": string[],
        "modified": string[],
        "untracked": string[]
    },
    "isClean": boolean
}
```

Implementation:
```javascript
const statusOutput = await execGitCommand('status --porcelain', projectPath);
const branchOutput = await execGitCommand('branch --show-current', projectPath);

// Parse porcelain output
statusOutput.split('\n').forEach(line => {
    const status = line.substring(0, 2);
    const filename = line.substring(3);
    
    if (status.includes('A') || status.includes('M')) {
        result.staged.push(filename);
    } else if (status.includes('M') || status.includes('D')) {
        result.modified.push(filename);
    } else if (status === '??') {
        result.untracked.push(filename);
    }
});
```

#### Branch Management
```javascript
GET /api/git/:projectName/branches
Response: {
    "current": string,
    "local": string[],
    "remote": string[]
}

POST /api/git/:projectName/branch
Body: { "name": string }
Response: { "success": boolean, "branch": string }
```

### Commit Operations

#### File Staging
```javascript
POST /api/git/:projectName/add
Body: { "files": string[] }
Response: { "success": boolean, "staged": string[] }
```

#### Commit Creation
```javascript
POST /api/git/:projectName/commit
Body: { "message": string }
Response: { 
    "success": boolean, 
    "commit": string,  // commit hash
    "message": string
}
```

Validation:
```javascript
if (!message || message.trim().length === 0) {
    return res.status(400).json({ 
        error: 'Commit message is required' 
    });
}

// Prevent empty commits
const statusCheck = await execGitCommand('diff --cached --name-only', projectPath);
if (!statusCheck.trim()) {
    return res.status(400).json({ 
        error: 'No staged changes to commit' 
    });
}
```

### Remote Operations

#### Push/Pull Operations
```javascript
POST /api/git/:projectName/push
Body: { "remote": string, "branch": string }

POST /api/git/:projectName/pull
Body: { "remote": string, "branch": string }
```

Error handling for remote operations:
```javascript
catch (error) {
    if (error.message.includes('Permission denied')) {
        res.status(401).json({ error: 'Authentication required for remote repository' });
    } else if (error.message.includes('Network is unreachable')) {
        res.status(503).json({ error: 'Network connection unavailable' });
    } else {
        res.status(500).json({ error: 'Git operation failed' });
    }
}
```

### Security Considerations

#### Path Validation
```javascript
const validateProjectPath = async (projectName) => {
    const projectPath = await extractProjectDirectory(projectName);
    
    // Ensure path is absolute and exists
    if (!path.isAbsolute(projectPath)) {
        throw new Error('Invalid project path');
    }
    
    // Check if it's a git repository
    await fs.access(path.join(projectPath, '.git'));
    return projectPath;
};
```

#### Command Injection Prevention
```javascript
const execGitCommand = async (command, cwd) => {
    // Whitelist allowed git commands
    const allowedCommands = [
        'status', 'branch', 'add', 'commit', 'push', 'pull', 
        'diff', 'log', 'remote', 'checkout'
    ];
    
    const baseCommand = command.split(' ')[0];
    if (!allowedCommands.includes(baseCommand)) {
        throw new Error('Git command not allowed');
    }
    
    return new Promise((resolve, reject) => {
        exec(`git ${command}`, { cwd }, (error, stdout, stderr) => {
            if (error) reject(error);
            else resolve(stdout);
        });
    });
};
```

## MCP Configuration Routes (mcp.js)

### Model Context Protocol Management

#### MCP Server Discovery
```javascript
GET /api/mcp/servers
Response: {
    "servers": [
        {
            "name": string,
            "command": string[],
            "args": string[],
            "env": object
        }
    ]
}
```

Implementation reads from Claude configuration files:
```javascript
const readMcpServers = async () => {
    const configPaths = [
        path.join(os.homedir(), '.claude.json'),
        path.join(os.homedir(), '.config', 'claude', 'config.json')
    ];
    
    for (const configPath of configPaths) {
        try {
            const configData = await fs.readFile(configPath, 'utf8');
            const config = JSON.parse(configData);
            return config.mcpServers || {};
        } catch (error) {
            // Continue to next config path
        }
    }
    
    return {};
};
```

#### Configuration Updates
```javascript
POST /api/mcp/servers
Body: {
    "servers": {
        "server-name": {
            "command": string,
            "args": string[],
            "env": object
        }
    }
}
```

Configuration validation:
```javascript
const validateMcpConfig = (servers) => {
    for (const [name, config] of Object.entries(servers)) {
        if (!config.command || typeof config.command !== 'string') {
            throw new Error(`Invalid command for server: ${name}`);
        }
        
        if (config.args && !Array.isArray(config.args)) {
            throw new Error(`Invalid args for server: ${name}`);
        }
        
        if (config.env && typeof config.env !== 'object') {
            throw new Error(`Invalid env for server: ${name}`);
        }
    }
};
```

## Cursor CLI Routes (cursor.js) - v1.7.0

### Cursor Integration Status

**Note**: Cursor CLI integration includes native SQLite dependencies that are disabled for Android/Termux compatibility. These endpoints return appropriate error messages when SQLite functionality is unavailable.

#### Configuration Management
```javascript
GET /api/cursor/config
Response: {
    "available": boolean,
    "config": object | null,
    "error": string | null
}
```

#### Session Discovery
```javascript
GET /api/cursor/sessions/:projectPath
Response: {
    "available": boolean,
    "sessions": array | null,
    "error": string | null
}
```

#### Compatibility Handling
```javascript
// Check if SQLite functionality is available
const isSqliteAvailable = () => {
    try {
        require('sqlite3');
        return true;
    } catch {
        return false;
    }
};

// Return appropriate response for disabled functionality
if (!isSqliteAvailable()) {
    return res.json({
        available: false,
        error: 'Cursor integration disabled for Android/Termux compatibility'
    });
}
```

## Common API Patterns

### Error Response Format
```javascript
{
    "error": string,           // Human-readable error message
    "code": string,           // Error code (optional)
    "details": object         // Additional error details (optional)
}
```

### Success Response Format
```javascript
{
    "success": boolean,
    "data": object,           // Response payload
    "message": string         // Success message (optional)
}
```

### Pagination Pattern
```javascript
GET /api/endpoint?limit=10&offset=0
Response: {
    "data": array,
    "pagination": {
        "limit": number,
        "offset": number,
        "total": number,
        "hasMore": boolean
    }
}
```

### Project Path Resolution

#### Consistent Path Handling
```javascript
const resolveProjectPath = async (projectName) => {
    try {
        // Use project discovery system
        const actualPath = await extractProjectDirectory(projectName);
        
        // Validate path exists and is accessible
        await fs.access(actualPath, fs.constants.R_OK);
        
        return actualPath;
    } catch (error) {
        throw new Error(`Project not found: ${projectName}`);
    }
};
```

#### Path Security
```javascript
const validatePath = (filePath, projectPath) => {
    const absoluteFilePath = path.resolve(filePath);
    const absoluteProjectPath = path.resolve(projectPath);
    
    // Ensure file is within project directory
    if (!absoluteFilePath.startsWith(absoluteProjectPath)) {
        throw new Error('File access outside project directory not allowed');
    }
    
    return absoluteFilePath;
};
```

### Async Error Handling

#### Express Error Wrapper
```javascript
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Usage
router.get('/endpoint', asyncHandler(async (req, res) => {
    const data = await someAsyncOperation();
    res.json({ success: true, data });
}));
```

#### Centralized Error Handler
```javascript
const errorHandler = (err, req, res, next) => {
    console.error('API Error:', err);
    
    if (err.code === 'ENOENT') {
        return res.status(404).json({ error: 'Resource not found' });
    } else if (err.code === 'EACCES') {
        return res.status(403).json({ error: 'Access denied' });
    } else if (err.name === 'ValidationError') {
        return res.status(400).json({ error: err.message });
    }
    
    res.status(500).json({ error: 'Internal server error' });
};
```

## Performance Optimizations

### Response Caching
```javascript
// Cache expensive operations
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const getCachedResult = async (key, operation) => {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    
    const result = await operation();
    cache.set(key, { data: result, timestamp: Date.now() });
    return result;
};
```

### Request Optimization
```javascript
// Batch operations where possible
router.post('/git/:projectName/add-multiple', async (req, res) => {
    const { files } = req.body;
    
    // Single git command for multiple files
    const fileList = files.map(f => `"${f}"`).join(' ');
    await execGitCommand(`add ${fileList}`, projectPath);
    
    res.json({ success: true, staged: files });
});
```

### Stream Processing
```javascript
// Stream large responses
router.get('/git/:projectName/log', async (req, res) => {
    const gitProcess = spawn('git', ['log', '--oneline'], { 
        cwd: projectPath,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    
    res.setHeader('Content-Type', 'application/json');
    res.write('{"commits":[');
    
    let first = true;
    gitProcess.stdout.on('data', (chunk) => {
        const lines = chunk.toString().split('\n').filter(Boolean);
        for (const line of lines) {
            if (!first) res.write(',');
            res.write(JSON.stringify({ line }));
            first = false;
        }
    });
    
    gitProcess.on('close', () => {
        res.write(']}');
        res.end();
    });
});
```

---

*These API routes provide comprehensive access to all Claude Code UI functionality while maintaining security, performance, and compatibility with Android/Termux environments.*