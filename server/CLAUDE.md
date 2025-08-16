# Server Architecture Documentation

## Overview

The server component is a Node.js Express.js application that provides the backend API and WebSocket services for the Claude Code UI. It integrates with the Claude CLI, manages project discovery, handles authentication, and provides real-time terminal sessions.

## Server Structure

```
server/
├── index.js              # Main server entry point and configuration
├── claude-cli.js         # Claude CLI integration and session management
├── cursor-cli.js         # Cursor CLI integration (new in v1.7.0)
├── projects.js           # Project discovery and management system
├── database/             # Database layer and schemas
├── routes/               # API route handlers
└── middleware/           # Authentication and request processing
```

## Core Architecture

### Main Server (index.js)

The main server file orchestrates all backend services:

#### Server Configuration
```javascript
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
```

#### Key Features
- **Environment Configuration**: Loads `.env` variables with fallbacks
- **CORS Support**: Configured for cross-origin requests
- **Static File Serving**: Serves built frontend assets in production
- **WebSocket Integration**: Dual-path WebSocket server for chat and shell
- **File System Watching**: Real-time project change detection with chokidar

#### WebSocket Architecture
```javascript
// Dual WebSocket endpoints
'/ws'    -> Chat WebSocket (Claude conversations)
'/shell' -> Terminal WebSocket (shell sessions)
```

### Authentication Flow

#### WebSocket Authentication
```javascript
verifyClient: (info) => {
    const token = extractTokenFromQuery(info.req.url) || 
                  extractTokenFromHeaders(info.req.headers);
    return authenticateWebSocket(token);
}
```

#### API Authentication
- JWT token validation on protected routes
- Optional API key validation for additional security
- User context injection into request objects

### Project Watching System

Real-time project file monitoring using chokidar:

```javascript
const watcher = chokidar.watch(claudeProjectsPath, {
    ignored: ['**/node_modules/**', '**/.git/**'],
    persistent: true,
    ignoreInitial: true,
    debounceTimer: 300ms
});
```

#### Change Detection
- File additions, modifications, deletions
- Directory structure changes
- Automatic project list updates
- Real-time client notifications

## Claude CLI Integration (claude-cli.js)

### Session Management

#### Active Session Tracking
```javascript
const activeSessions = new Map(); // sessionId -> ClaudeProcess
```

#### Process Lifecycle
1. **Spawn**: Create new Claude CLI process with project context
2. **Stream**: Real-time stdout/stderr streaming via WebSocket
3. **Input**: User input forwarding to Claude process
4. **Cleanup**: Graceful process termination and resource cleanup

#### Session Resumption
```javascript
// Resume existing session
claude --resume ${sessionId}

// Fallback to new session if resume fails
claude || claude
```

### Command Processing

#### Input Sanitization
- Command validation and filtering
- Path sanitization for security
- Input length limitations

#### Output Processing
- ANSI escape sequence handling
- URL detection and extraction
- Error message formatting

## Project Discovery System (projects.js)

### Multi-CLI Support

The project system supports both Claude CLI and Cursor CLI:

#### Claude Projects
- Located in `~/.claude/projects/`
- Directory-based with encoded project paths
- `.jsonl` files contain conversation history
- `cwd` field extraction for project path resolution

#### Cursor Projects (v1.7.0)
- Located in `~/.cursor/chats/`
- MD5 hash-based directory naming
- SQLite database storage (disabled for Android/Termux)
- Path resolution via hash computation

### Discovery Algorithm

#### Claude Project Discovery
```javascript
1. Scan ~/.claude/projects/ directory
2. For each project directory:
   - Extract project path from .jsonl files (cwd field)
   - Fall back to decoded directory name
   - Validate project path existence
3. Merge with manually added projects
```

#### Session Discovery
```javascript
1. For each known project:
   - Scan project directory for .jsonl files
   - Parse session metadata
   - Extract timestamps and summaries
   - Sort by modification time
```

### Caching Strategy

#### Project Directory Cache
```javascript
const projectDirectoryCache = new Map();
// Cache extracted project paths to minimize file I/O
// Cleared when project configuration changes
```

#### Performance Optimizations
- Lazy loading of session data
- Efficient file system scanning
- Debounced change notifications
- Memory-conscious data structures

## API Architecture

### Route Organization

#### Public Routes
- `/api/auth/*` - Authentication endpoints
- `/api/config` - Server configuration

#### Protected Routes
- `/api/projects/*` - Project management
- `/api/git/*` - Git operations
- `/api/mcp/*` - MCP configuration
- `/api/cursor/*` - Cursor CLI integration (v1.7.0)

### File Operations

#### Secure File Access
```javascript
// Path validation
if (!filePath || !path.isAbsolute(filePath)) {
    return res.status(400).json({ error: 'Invalid file path' });
}

// File reading with error handling
try {
    const content = await fsPromises.readFile(filePath, 'utf8');
    res.json({ content, path: filePath });
} catch (error) {
    // Handle ENOENT, EACCES, and other file system errors
}
```

#### File Backup System
```javascript
// Automatic backup creation before file modifications
const backupPath = filePath + '.backup.' + Date.now();
await fsPromises.copyFile(filePath, backupPath);
```

### Image Upload Processing

#### Multi-part Form Handling
```javascript
const storage = multer.diskStorage({
    destination: path.join(os.tmpdir(), 'claude-ui-uploads'),
    filename: uniqueSuffix + '-' + sanitizedName
});
```

#### Image Processing Pipeline
1. **Upload**: Temporary file storage
2. **Validation**: MIME type and size checking
3. **Conversion**: Base64 encoding for frontend consumption
4. **Cleanup**: Immediate temporary file removal

## WebSocket Implementation

### Dual WebSocket Architecture

#### Chat WebSocket (/ws)
```javascript
Purpose: Claude conversations and project management
Features:
- Claude command execution
- Session abortion
- Project updates
- Real-time messaging
```

#### Shell WebSocket (/shell)
```javascript
Purpose: Terminal emulation and shell sessions
Features:
- Interactive shell sessions
- Terminal resizing (limited without node-pty)
- Real-time command output
- Process lifecycle management
```

### Message Protocol

#### Chat Messages
```json
{
    "type": "claude-command",
    "command": "user input",
    "options": {
        "projectPath": "/path/to/project",
        "sessionId": "optional-session-id"
    }
}
```

#### Shell Messages
```json
{
    "type": "init|input|resize",
    "data": "command or input data",
    "cols": 80,
    "rows": 24
}
```

### Connection Management

#### Client Tracking
```javascript
const connectedClients = new Set();
// Track active connections for project update broadcasts
```

#### Graceful Cleanup
```javascript
ws.on('close', () => {
    connectedClients.delete(ws);
    if (shellProcess) {
        shellProcess.kill('SIGTERM');
    }
});
```

## Security Architecture

### Input Validation

#### Path Security
```javascript
// Prevent path traversal attacks
if (!path.isAbsolute(filePath)) {
    throw new Error('Only absolute paths allowed');
}

// Validate file access permissions
await fsPromises.access(filePath, fs.constants.R_OK);
```

#### Command Sanitization
- Shell command validation
- Argument sanitization
- Environment variable filtering

### Process Isolation

#### Shell Process Security
```javascript
const shellProcess = spawn(shell, shellArgs, {
    cwd: safeWorkingDirectory,
    env: sanitizedEnvironment,
    uid: processUserId, // When available
    gid: processGroupId // When available
});
```

## Error Handling

### Graceful Error Recovery

#### Database Errors
```javascript
try {
    const result = userDb.operation();
    return result;
} catch (err) {
    console.error('Database operation failed:', err);
    return { error: 'Database unavailable' };
}
```

#### File System Errors
```javascript
catch (error) {
    if (error.code === 'ENOENT') {
        res.status(404).json({ error: 'File not found' });
    } else if (error.code === 'EACCES') {
        res.status(403).json({ error: 'Permission denied' });
    } else {
        res.status(500).json({ error: 'Internal server error' });
    }
}
```

### Process Management

#### Claude Process Monitoring
```javascript
claudeProcess.on('exit', (code, signal) => {
    console.log(`Claude process exited: ${code}, signal: ${signal}`);
    cleanup(sessionId);
});

claudeProcess.on('error', (error) => {
    console.error('Claude process error:', error);
    notifyClient(sessionId, { type: 'error', message: error.message });
});
```

## Performance Optimizations

### Memory Management

#### Process Cleanup
```javascript
// Automatic cleanup of zombie processes
setInterval(() => {
    activeSessions.forEach((session, id) => {
        if (!session.isActive() || session.isExpired()) {
            cleanupSession(id);
        }
    });
}, 60000); // Every minute
```

#### Stream Buffer Management
```javascript
// Prevent memory leaks from large output
if (outputBuffer.length > MAX_BUFFER_SIZE) {
    outputBuffer = outputBuffer.slice(-KEEP_BUFFER_SIZE);
}
```

### I/O Optimization

#### File System Caching
```javascript
// Cache frequently accessed project data
const projectCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
```

#### Debounced File Watching
```javascript
// Prevent excessive file system events
const debouncedUpdate = debounce((eventType, filePath) => {
    broadcastProjectUpdate(eventType, filePath);
}, 300);
```

## Android/Termux Specific Adaptations

### Pure JavaScript Implementations

#### Process Spawning
```javascript
// Use child_process.spawn instead of node-pty
const shellProcess = spawn(shell, shellArgs, {
    stdio: ['pipe', 'pipe', 'pipe']
});

// Handle stdout/stderr separately
shellProcess.stdout.on('data', handleOutput);
shellProcess.stderr.on('data', handleError);
```

#### Database Operations
```javascript
// sql.js instead of better-sqlite3
const SQL = await initSqlJs();
const db = new SQL.Database(filebuffer);

// Manual file persistence
const saveDatabase = () => {
    const data = db.export();
    fs.writeFileSync(DB_PATH, data);
};
```

### Resource Constraints

#### Memory Efficiency
- Streaming data processing
- Efficient garbage collection
- Buffer size limitations
- Connection pooling

#### Network Optimization
- Compressed WebSocket messages
- Efficient JSON serialization
- Chunked file transfers
- Bandwidth-aware operations

---

*For detailed implementation of specific components, refer to the CLAUDE.md files in the respective subdirectories.*