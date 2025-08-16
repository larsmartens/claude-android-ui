# Authentication Middleware Documentation

## Overview

The middleware directory contains authentication and authorization logic for the Claude Code UI backend. The primary focus is on JWT-based authentication with optional API key validation, designed to secure both REST API endpoints and WebSocket connections.

## Middleware Structure

```
server/middleware/
└── auth.js              # Complete authentication system
```

## Authentication Architecture

### Token-Based Authentication System

#### JWT Implementation
```javascript
import jwt from 'jsonwebtoken';

// JWT secret generation and management
const JWT_SECRET = process.env.JWT_SECRET || 
    crypto.randomBytes(64).toString('hex');

// Token generation for authenticated users
const generateToken = (user) => {
    return jwt.sign(
        { 
            userId: user.id, 
            username: user.username 
        },
        JWT_SECRET,
        { 
            expiresIn: '7d',  // 7-day token validity
            issuer: 'claude-code-ui',
            audience: 'claude-code-ui-client'
        }
    );
};
```

#### Token Structure
```json
{
    "header": {
        "alg": "HS256",
        "typ": "JWT"
    },
    "payload": {
        "userId": 1,
        "username": "user",
        "iat": 1640995200,
        "exp": 1641600000,
        "iss": "claude-code-ui",
        "aud": "claude-code-ui-client"
    }
}
```

### API Key Validation (Optional)

#### Configuration-Based Security
```javascript
const validateApiKey = (req, res, next) => {
    const configuredApiKey = process.env.API_KEY;
    
    // Skip validation if no API key is configured
    if (!configuredApiKey) {
        return next();
    }
    
    const providedKey = req.headers['x-api-key'] || 
                       req.query.api_key;
    
    if (!providedKey || providedKey !== configuredApiKey) {
        return res.status(401).json({ 
            error: 'Valid API key required' 
        });
    }
    
    next();
};
```

#### Use Cases
- **Development**: No API key required for local development
- **Production**: Optional additional security layer
- **Public Deployment**: Prevent unauthorized access to the application

## Authentication Middleware Functions

### Primary Authentication Middleware

#### JWT Token Validation
```javascript
const authenticateToken = async (req, res, next) => {
    try {
        // Extract token from multiple sources
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1] || // Bearer token
                     req.headers['x-auth-token'] ||              // Custom header
                     req.query.token;                            // Query parameter
        
        if (!token) {
            return res.status(401).json({ 
                error: 'Access token required' 
            });
        }
        
        // Verify and decode token
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Fetch current user data from database
        const user = userDb.getUserById(decoded.userId);
        if (!user) {
            return res.status(401).json({ 
                error: 'Invalid token: user not found' 
            });
        }
        
        // Attach user to request context
        req.user = user;
        next();
        
    } catch (error) {
        console.error('Token validation error:', error.message);
        
        // Handle specific JWT errors
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid token format' });
        } else if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        } else if (error.name === 'NotBeforeError') {
            return res.status(401).json({ error: 'Token not active yet' });
        }
        
        return res.status(500).json({ error: 'Authentication error' });
    }
};
```

### WebSocket Authentication

#### Connection-Time Authentication
```javascript
const authenticateWebSocket = (token) => {
    try {
        if (!token) {
            console.log('❌ No token provided for WebSocket connection');
            return null;
        }
        
        // Verify JWT token
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Validate user exists and is active
        const user = userDb.getUserById(decoded.userId);
        if (!user) {
            console.log('❌ WebSocket token validation failed: user not found');
            return null;
        }
        
        console.log('✅ WebSocket authenticated for user:', user.username);
        return {
            id: user.id,
            username: user.username
        };
        
    } catch (error) {
        console.error('WebSocket authentication error:', error.message);
        return null;
    }
};
```

#### Token Extraction from WebSocket
```javascript
// Extract token from WebSocket connection
const extractWebSocketToken = (request) => {
    // Parse URL to get query parameters
    const url = new URL(request.url, 'http://localhost');
    const tokenFromQuery = url.searchParams.get('token');
    
    // Check authorization header
    const authHeader = request.headers.authorization;
    const tokenFromHeader = authHeader && authHeader.split(' ')[1];
    
    return tokenFromQuery || tokenFromHeader;
};
```

## Security Features

### Token Security

#### Secure Secret Management
```javascript
// Environment-based secret with secure fallback
const generateSecureSecret = () => {
    if (process.env.JWT_SECRET) {
        // Use provided secret
        return process.env.JWT_SECRET;
    }
    
    // Generate cryptographically secure random secret
    const secret = crypto.randomBytes(64).toString('hex');
    console.warn('⚠️  Generated random JWT secret. Set JWT_SECRET environment variable for production.');
    return secret;
};

const JWT_SECRET = generateSecureSecret();
```

#### Token Expiration Strategy
```javascript
const TOKEN_EXPIRY = {
    short: '1h',      // For high-security operations
    medium: '24h',    // For normal API access
    long: '7d',       // For persistent login
    refresh: '30d'    // For refresh tokens
};

// Token generation with appropriate expiry
const generateToken = (user, type = 'medium') => {
    return jwt.sign(
        payload, 
        JWT_SECRET, 
        { expiresIn: TOKEN_EXPIRY[type] }
    );
};
```

### Input Validation

#### Header Validation
```javascript
const validateAuthHeaders = (req) => {
    const authHeader = req.headers['authorization'];
    
    if (authHeader) {
        // Validate Bearer token format
        if (!authHeader.startsWith('Bearer ')) {
            throw new Error('Invalid authorization header format');
        }
        
        const token = authHeader.split(' ')[1];
        if (!token || token.length < 10) {
            throw new Error('Invalid token format');
        }
    }
    
    return true;
};
```

#### Rate Limiting Integration
```javascript
const createRateLimiter = (windowMs, max) => {
    const requests = new Map();
    
    return (req, res, next) => {
        const clientId = req.ip || req.connection.remoteAddress;
        const now = Date.now();
        const windowStart = now - windowMs;
        
        // Clean old requests
        if (requests.has(clientId)) {
            requests.set(clientId, 
                requests.get(clientId).filter(time => time > windowStart)
            );
        } else {
            requests.set(clientId, []);
        }
        
        const requestCount = requests.get(clientId).length;
        
        if (requestCount >= max) {
            return res.status(429).json({ 
                error: 'Too many requests' 
            });
        }
        
        requests.get(clientId).push(now);
        next();
    };
};

// Apply rate limiting to authentication endpoints
const authRateLimit = createRateLimiter(15 * 60 * 1000, 5); // 5 attempts per 15 minutes
```

## Error Handling

### Authentication Error Types

#### Token Validation Errors
```javascript
const handleTokenError = (error, req, res) => {
    const errorMap = {
        'JsonWebTokenError': {
            status: 401,
            message: 'Invalid token format',
            code: 'INVALID_TOKEN'
        },
        'TokenExpiredError': {
            status: 401,
            message: 'Token has expired',
            code: 'TOKEN_EXPIRED'
        },
        'NotBeforeError': {
            status: 401,
            message: 'Token not active yet',
            code: 'TOKEN_NOT_ACTIVE'
        }
    };
    
    const errorInfo = errorMap[error.name] || {
        status: 500,
        message: 'Authentication error',
        code: 'AUTH_ERROR'
    };
    
    return res.status(errorInfo.status).json({
        error: errorInfo.message,
        code: errorInfo.code
    });
};
```

#### Database Connection Errors
```javascript
const handleDatabaseError = (error, req, res) => {
    console.error('Database error during authentication:', error);
    
    if (error.message.includes('database is locked')) {
        return res.status(503).json({ 
            error: 'Authentication service temporarily unavailable' 
        });
    }
    
    return res.status(500).json({ 
        error: 'Authentication system error' 
    });
};
```

### Logging and Monitoring

#### Authentication Event Logging
```javascript
const logAuthEvent = (type, user, request, success = true) => {
    const logEntry = {
        timestamp: new Date().toISOString(),
        type: type, // 'login', 'logout', 'token_validation', 'api_key_check'
        user: user ? { id: user.id, username: user.username } : null,
        ip: request.ip || request.connection.remoteAddress,
        userAgent: request.headers['user-agent'],
        success: success
    };
    
    console.log(`🔐 Auth Event: ${JSON.stringify(logEntry)}`);
    
    // In production, send to logging service
    // logService.record('auth', logEntry);
};
```

#### Security Monitoring
```javascript
const detectSuspiciousActivity = (req, user) => {
    const warnings = [];
    
    // Check for unusual patterns
    if (req.headers['user-agent']?.includes('bot')) {
        warnings.push('Bot-like user agent detected');
    }
    
    // Check for rapid requests
    const userRequests = getUserRequestHistory(user.id);
    if (userRequests.length > 100) { // Last 100 requests
        warnings.push('High request frequency detected');
    }
    
    // Check for geographic anomalies (if geo-IP available)
    // const currentLocation = geoip.lookup(req.ip);
    
    if (warnings.length > 0) {
        console.warn(`⚠️  Suspicious activity for user ${user.username}:`, warnings);
        // In production, trigger security alerts
    }
};
```

## Integration Patterns

### Express.js Integration

#### Route Protection
```javascript
// Protect single route
app.get('/api/protected', authenticateToken, (req, res) => {
    res.json({ user: req.user });
});

// Protect entire route group
app.use('/api/admin', authenticateToken, adminRoutes);

// Optional authentication (user info if available)
app.get('/api/optional', optionalAuth, (req, res) => {
    res.json({ 
        authenticated: !!req.user,
        user: req.user || null 
    });
});
```

#### Middleware Chain Composition
```javascript
// Combine multiple middleware functions
const protectWithApiKey = [validateApiKey, authenticateToken];
const protectWithRateLimit = [authRateLimit, authenticateToken];
const fullProtection = [validateApiKey, authRateLimit, authenticateToken];

// Apply to routes
app.use('/api/public', validateApiKey);
app.use('/api/auth', protectWithRateLimit);
app.use('/api/admin', fullProtection);
```

### WebSocket Integration

#### Connection Authentication
```javascript
const wss = new WebSocketServer({
    server,
    verifyClient: (info) => {
        const token = extractWebSocketToken(info.req);
        const user = authenticateWebSocket(token);
        
        if (!user) {
            return false; // Reject connection
        }
        
        // Store user info for use in connection handler
        info.req.user = user;
        return true; // Accept connection
    }
});
```

#### Message Authentication
```javascript
wss.on('connection', (ws, request) => {
    const user = request.user;
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            
            // Validate message permissions
            if (!validateMessagePermissions(message, user)) {
                ws.send(JSON.stringify({ 
                    error: 'Insufficient permissions' 
                }));
                return;
            }
            
            // Process authenticated message
            handleAuthenticatedMessage(message, user, ws);
            
        } catch (error) {
            console.error('Message processing error:', error);
            ws.send(JSON.stringify({ 
                error: 'Message processing failed' 
            }));
        }
    });
});
```

## Performance Optimizations

### Token Caching

#### In-Memory Token Cache
```javascript
const tokenCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const getCachedTokenValidation = (token) => {
    const cached = tokenCache.get(token);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.user;
    }
    return null;
};

const setCachedTokenValidation = (token, user) => {
    tokenCache.set(token, {
        user: user,
        timestamp: Date.now()
    });
    
    // Cleanup old entries periodically
    if (tokenCache.size > 1000) {
        cleanupTokenCache();
    }
};
```

#### Cache Cleanup
```javascript
const cleanupTokenCache = () => {
    const now = Date.now();
    const entries = Array.from(tokenCache.entries());
    
    for (const [token, data] of entries) {
        if (now - data.timestamp > CACHE_TTL) {
            tokenCache.delete(token);
        }
    }
    
    console.log(`🧹 Cleaned up token cache: ${entries.length - tokenCache.size} entries removed`);
};

// Periodic cache cleanup
setInterval(cleanupTokenCache, 10 * 60 * 1000); // Every 10 minutes
```

### Database Query Optimization

#### User Lookup Optimization
```javascript
// Cache user lookups to reduce database queries
const userCache = new Map();

const getCachedUser = async (userId) => {
    if (userCache.has(userId)) {
        return userCache.get(userId);
    }
    
    const user = userDb.getUserById(userId);
    if (user) {
        userCache.set(userId, user);
        // Expire user cache entries after 10 minutes
        setTimeout(() => userCache.delete(userId), 10 * 60 * 1000);
    }
    
    return user;
};
```

## Configuration Management

### Environment Configuration
```javascript
const authConfig = {
    jwtSecret: process.env.JWT_SECRET,
    apiKey: process.env.API_KEY,
    tokenExpiry: process.env.TOKEN_EXPIRY || '7d',
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW) || 900000, // 15 min
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX) || 5,
    enableApiKeyValidation: process.env.ENABLE_API_KEY === 'true',
    logAuthEvents: process.env.LOG_AUTH_EVENTS !== 'false'
};
```

### Dynamic Configuration
```javascript
const updateAuthConfig = (newConfig) => {
    // Validate configuration changes
    if (newConfig.tokenExpiry && !isValidTimespan(newConfig.tokenExpiry)) {
        throw new Error('Invalid token expiry format');
    }
    
    // Apply configuration changes
    Object.assign(authConfig, newConfig);
    
    // Clear caches to apply new settings
    tokenCache.clear();
    userCache.clear();
    
    console.log('🔧 Authentication configuration updated');
};
```

---

*This authentication middleware provides a secure, performant, and flexible foundation for the Claude Code UI application, with special consideration for mobile and embedded deployment environments.*