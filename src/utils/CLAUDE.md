# Utility Functions Documentation

## Overview

The utils directory contains reusable utility functions, API clients, helper functions, and shared constants that support the Claude Code UI application. These utilities provide common functionality used across components, handle data transformations, and abstract complex operations into simple, testable functions.

## Utils Structure

```
src/utils/
├── api.js           # HTTP client and API communication layer
├── auth.js          # Authentication utilities and token management
├── formatting.js    # Data formatting and display utilities
├── validation.js    # Input validation and sanitization
├── constants.js     # Application constants and configuration
├── storage.js       # Browser storage abstractions
├── clipboard.js     # Clipboard operations and feedback
└── performance.js   # Performance monitoring and optimization
```

## API Client (api.js)

### HTTP Client Configuration

#### Base API Client
```javascript
import axios from 'axios';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:3001/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor for authentication
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth-token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      localStorage.removeItem('auth-token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
```

#### API Methods
```javascript
// Authentication endpoints
export const authApi = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  logout: () => api.post('/auth/logout'),
  getUser: () => api.get('/auth/user'),
  checkStatus: () => api.get('/auth/status')
};

// Project management endpoints
export const projectsApi = {
  getAll: () => api.get('/projects'),
  getById: (id) => api.get(`/projects/${id}`),
  getSessions: (projectName) => api.get(`/projects/${projectName}/sessions`),
  getFiles: (projectName) => api.get(`/projects/${projectName}/files`),
  getFile: (projectName, filePath) => 
    api.get(`/projects/${projectName}/file?filePath=${encodeURIComponent(filePath)}`),
  saveFile: (projectName, filePath, content) =>
    api.put(`/projects/${projectName}/file`, { filePath, content }),
  uploadImage: (file) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post('/upload/image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }
};

// Git operations endpoints
export const gitApi = {
  getStatus: (projectName) => api.get(`/git/${projectName}/status`),
  getBranches: (projectName) => api.get(`/git/${projectName}/branches`),
  addFiles: (projectName, files) => api.post(`/git/${projectName}/add`, { files }),
  commit: (projectName, message) => api.post(`/git/${projectName}/commit`, { message }),
  push: (projectName, remote, branch) => 
    api.post(`/git/${projectName}/push`, { remote, branch }),
  pull: (projectName, remote, branch) => 
    api.post(`/git/${projectName}/pull`, { remote, branch }),
  createBranch: (projectName, branchName) =>
    api.post(`/git/${projectName}/branch`, { name: branchName }),
  checkout: (projectName, branch) =>
    api.post(`/git/${projectName}/checkout`, { branch })
};

// MCP configuration endpoints
export const mcpApi = {
  getServers: () => api.get('/mcp/servers'),
  updateServers: (servers) => api.post('/mcp/servers', { servers }),
  testConnection: (serverName) => api.post(`/mcp/test/${serverName}`)
};
```

#### Error Handling Utilities
```javascript
export const handleApiError = (error, fallbackMessage = 'An error occurred') => {
  if (error.response) {
    // Server responded with error status
    const message = error.response.data?.error || error.response.data?.message;
    return {
      message: message || fallbackMessage,
      status: error.response.status,
      type: 'server'
    };
  } else if (error.request) {
    // Network error
    return {
      message: 'Network error - please check your connection',
      status: null,
      type: 'network'
    };
  } else {
    // Other error
    return {
      message: error.message || fallbackMessage,
      status: null,
      type: 'client'
    };
  }
};

export const isRetryableError = (error) => {
  const retryableStatuses = [408, 429, 500, 502, 503, 504];
  return error.response && retryableStatuses.includes(error.response.status);
};

export const withRetry = async (apiCall, maxRetries = 3, baseDelay = 1000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      if (attempt === maxRetries || !isRetryableError(error)) {
        throw error;
      }
      
      // Exponential backoff
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};
```

## Authentication Utilities (auth.js)

### Token Management

#### Token Utilities
```javascript
import { jwtDecode } from 'jwt-decode';

export const tokenUtils = {
  // Get token from storage
  getToken: () => {
    try {
      return localStorage.getItem('auth-token');
    } catch {
      return null;
    }
  },

  // Store token securely
  setToken: (token) => {
    try {
      localStorage.setItem('auth-token', token);
      return true;
    } catch {
      return false;
    }
  },

  // Remove token
  removeToken: () => {
    try {
      localStorage.removeItem('auth-token');
      return true;
    } catch {
      return false;
    }
  },

  // Decode JWT token
  decodeToken: (token) => {
    try {
      return jwtDecode(token);
    } catch {
      return null;
    }
  },

  // Check if token is expired
  isTokenExpired: (token) => {
    const decoded = tokenUtils.decodeToken(token);
    if (!decoded || !decoded.exp) return true;
    
    const currentTime = Date.now() / 1000;
    return decoded.exp < currentTime;
  },

  // Get token expiration time
  getTokenExpiration: (token) => {
    const decoded = tokenUtils.decodeToken(token);
    return decoded?.exp ? new Date(decoded.exp * 1000) : null;
  },

  // Check if token expires soon (within 5 minutes)
  isTokenExpiringSoon: (token) => {
    const decoded = tokenUtils.decodeToken(token);
    if (!decoded || !decoded.exp) return true;
    
    const currentTime = Date.now() / 1000;
    const fiveMinutes = 5 * 60;
    return decoded.exp < (currentTime + fiveMinutes);
  }
};

// Authentication state helpers
export const authHelpers = {
  // Check if user is authenticated
  isAuthenticated: () => {
    const token = tokenUtils.getToken();
    return token && !tokenUtils.isTokenExpired(token);
  },

  // Get current user from token
  getCurrentUser: () => {
    const token = tokenUtils.getToken();
    if (!token) return null;
    
    const decoded = tokenUtils.decodeToken(token);
    return decoded ? {
      id: decoded.userId,
      username: decoded.username,
      exp: decoded.exp,
      iat: decoded.iat
    } : null;
  },

  // Clear authentication state
  clearAuth: () => {
    tokenUtils.removeToken();
    // Clear any other auth-related storage
    localStorage.removeItem('user-preferences');
    sessionStorage.clear();
  },

  // Setup automatic token refresh
  setupTokenRefresh: (refreshCallback) => {
    const checkToken = () => {
      const token = tokenUtils.getToken();
      if (token && tokenUtils.isTokenExpiringSoon(token)) {
        refreshCallback();
      }
    };

    // Check every minute
    const interval = setInterval(checkToken, 60000);
    
    // Return cleanup function
    return () => clearInterval(interval);
  }
};
```

### Session Management
```javascript
export const sessionManager = {
  // Start new session
  startSession: (user, token) => {
    tokenUtils.setToken(token);
    sessionStorage.setItem('session-start', Date.now().toString());
    sessionStorage.setItem('user-id', user.id.toString());
  },

  // End session
  endSession: () => {
    authHelpers.clearAuth();
    sessionStorage.removeItem('session-start');
    sessionStorage.removeItem('user-id');
  },

  // Get session duration
  getSessionDuration: () => {
    const startTime = sessionStorage.getItem('session-start');
    if (!startTime) return 0;
    return Date.now() - parseInt(startTime);
  },

  // Check if session is active
  isSessionActive: () => {
    const startTime = sessionStorage.getItem('session-start');
    const userId = sessionStorage.getItem('user-id');
    return startTime && userId && authHelpers.isAuthenticated();
  }
};
```

## Formatting Utilities (formatting.js)

### Data Display Helpers

#### Date and Time Formatting
```javascript
export const dateUtils = {
  // Format relative time (e.g., "2 hours ago")
  formatRelativeTime: (date) => {
    const now = new Date();
    const targetDate = new Date(date);
    const diffMs = now.getTime() - targetDate.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    
    return targetDate.toLocaleDateString();
  },

  // Format absolute date/time
  formatDateTime: (date, options = {}) => {
    const {
      includeTime = true,
      includeSeconds = false,
      format = 'default'
    } = options;

    const targetDate = new Date(date);
    
    if (format === 'iso') {
      return targetDate.toISOString();
    }
    
    if (format === 'short') {
      return targetDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    }

    const dateOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };

    const timeOptions = {
      hour: '2-digit',
      minute: '2-digit',
      ...(includeSeconds && { second: '2-digit' })
    };

    if (includeTime) {
      return targetDate.toLocaleString('en-US', { ...dateOptions, ...timeOptions });
    } else {
      return targetDate.toLocaleDateString('en-US', dateOptions);
    }
  },

  // Format duration (e.g., "2h 30m")
  formatDuration: (milliseconds) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
};
```

#### File and Data Formatting
```javascript
export const fileUtils = {
  // Format file size
  formatFileSize: (bytes) => {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  },

  // Get file extension
  getFileExtension: (filename) => {
    return filename.split('.').pop()?.toLowerCase() || '';
  },

  // Get file type from extension
  getFileType: (filename) => {
    const ext = fileUtils.getFileExtension(filename);
    const typeMap = {
      // Images
      jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', svg: 'image', webp: 'image',
      // Documents
      pdf: 'document', doc: 'document', docx: 'document', txt: 'document', md: 'document',
      // Code
      js: 'code', jsx: 'code', ts: 'code', tsx: 'code', py: 'code', java: 'code',
      html: 'code', css: 'code', scss: 'code', json: 'code', xml: 'code',
      // Archives
      zip: 'archive', rar: 'archive', tar: 'archive', gz: 'archive',
      // Audio/Video
      mp3: 'audio', wav: 'audio', mp4: 'video', avi: 'video', mov: 'video'
    };
    
    return typeMap[ext] || 'file';
  },

  // Generate file icon
  getFileIcon: (filename) => {
    const type = fileUtils.getFileType(filename);
    const iconMap = {
      image: '🖼️',
      document: '📄',
      code: '💻',
      archive: '📦',
      audio: '🎵',
      video: '🎬',
      file: '📎'
    };
    
    return iconMap[type] || iconMap.file;
  }
};
```

#### Text and String Utilities
```javascript
export const textUtils = {
  // Truncate text with ellipsis
  truncate: (text, maxLength, suffix = '...') => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - suffix.length) + suffix;
  },

  // Convert camelCase to Title Case
  camelToTitle: (camelCase) => {
    return camelCase
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  },

  // Convert snake_case to Title Case
  snakeToTitle: (snakeCase) => {
    return snakeCase
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  },

  // Pluralize word based on count
  pluralize: (word, count, pluralForm = null) => {
    if (count === 1) return word;
    return pluralForm || word + 's';
  },

  // Format number with commas
  formatNumber: (number) => {
    return number.toLocaleString();
  },

  // Extract initials from name
  getInitials: (name, maxLength = 2) => {
    return name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .slice(0, maxLength)
      .join('');
  },

  // Generate random string
  generateId: (length = 8) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
};
```

## Validation Utilities (validation.js)

### Input Validation

#### Form Validation
```javascript
export const validators = {
  // Email validation
  email: (email) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return {
      isValid: regex.test(email),
      error: regex.test(email) ? null : 'Please enter a valid email address'
    };
  },

  // Password strength validation
  password: (password, options = {}) => {
    const {
      minLength = 6,
      requireUppercase = true,
      requireLowercase = true,
      requireNumbers = true,
      requireSpecialChars = false
    } = options;

    const errors = [];

    if (password.length < minLength) {
      errors.push(`Password must be at least ${minLength} characters long`);
    }

    if (requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (requireNumbers && !/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      isValid: errors.length === 0,
      errors,
      strength: calculatePasswordStrength(password)
    };
  },

  // Username validation
  username: (username) => {
    const minLength = 3;
    const maxLength = 20;
    const regex = /^[a-zA-Z0-9_-]+$/;

    if (username.length < minLength) {
      return {
        isValid: false,
        error: `Username must be at least ${minLength} characters long`
      };
    }

    if (username.length > maxLength) {
      return {
        isValid: false,
        error: `Username must be no more than ${maxLength} characters long`
      };
    }

    if (!regex.test(username)) {
      return {
        isValid: false,
        error: 'Username can only contain letters, numbers, hyphens, and underscores'
      };
    }

    return { isValid: true, error: null };
  },

  // URL validation
  url: (url) => {
    try {
      new URL(url);
      return { isValid: true, error: null };
    } catch {
      return {
        isValid: false,
        error: 'Please enter a valid URL'
      };
    }
  },

  // File validation
  file: (file, options = {}) => {
    const {
      maxSize = 10 * 1024 * 1024, // 10MB
      allowedTypes = [],
      requiredExtensions = []
    } = options;

    if (file.size > maxSize) {
      return {
        isValid: false,
        error: `File size must be less than ${fileUtils.formatFileSize(maxSize)}`
      };
    }

    if (allowedTypes.length > 0) {
      const isTypeAllowed = allowedTypes.some(type => {
        if (type.endsWith('/*')) {
          return file.type.startsWith(type.slice(0, -1));
        }
        return file.type === type;
      });

      if (!isTypeAllowed) {
        return {
          isValid: false,
          error: `File type ${file.type} is not allowed`
        };
      }
    }

    if (requiredExtensions.length > 0) {
      const ext = fileUtils.getFileExtension(file.name);
      if (!requiredExtensions.includes(ext)) {
        return {
          isValid: false,
          error: `File must have one of these extensions: ${requiredExtensions.join(', ')}`
        };
      }
    }

    return { isValid: true, error: null };
  }
};

const calculatePasswordStrength = (password) => {
  let score = 0;
  
  // Length bonus
  score += Math.min(password.length * 2, 20);
  
  // Character variety bonuses
  if (/[a-z]/.test(password)) score += 5;
  if (/[A-Z]/.test(password)) score += 5;
  if (/\d/.test(password)) score += 5;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) score += 10;
  
  // Pattern penalties
  if (/(.)\1{2,}/.test(password)) score -= 10; // Repeated characters
  if (/123|abc|qwe/i.test(password)) score -= 10; // Common sequences
  
  if (score < 30) return 'weak';
  if (score < 60) return 'medium';
  return 'strong';
};
```

#### Sanitization
```javascript
export const sanitizers = {
  // HTML sanitization
  html: (input) => {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
  },

  // Remove special characters
  alphanumeric: (input) => {
    return input.replace(/[^a-zA-Z0-9]/g, '');
  },

  // Clean filename
  filename: (input) => {
    return input
      .replace(/[<>:"/\\|?*]/g, '') // Remove invalid filename characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .toLowerCase();
  },

  // Clean URL slug
  slug: (input) => {
    return input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
};
```

## Constants (constants.js)

### Application Constants

```javascript
// API endpoints
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    LOGOUT: '/auth/logout',
    STATUS: '/auth/status',
    USER: '/auth/user'
  },
  PROJECTS: {
    LIST: '/projects',
    SESSIONS: (name) => `/projects/${name}/sessions`,
    FILES: (name) => `/projects/${name}/files`,
    FILE: (name) => `/projects/${name}/file`
  },
  GIT: {
    STATUS: (name) => `/git/${name}/status`,
    BRANCHES: (name) => `/git/${name}/branches`,
    ADD: (name) => `/git/${name}/add`,
    COMMIT: (name) => `/git/${name}/commit`
  }
};

// WebSocket endpoints
export const WS_ENDPOINTS = {
  CHAT: '/ws',
  SHELL: '/shell'
};

// Local storage keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth-token',
  THEME: 'theme',
  SETTINGS: 'app-settings',
  PROJECTS: 'cached-projects',
  LAST_PROJECT: 'last-selected-project'
};

// UI constants
export const UI_CONSTANTS = {
  SIDEBAR_WIDTH: 256,
  HEADER_HEIGHT: 64,
  MOBILE_BREAKPOINT: 768,
  TABLET_BREAKPOINT: 1024,
  DESKTOP_BREAKPOINT: 1280
};

// File size limits
export const FILE_LIMITS = {
  IMAGE_MAX_SIZE: 10 * 1024 * 1024, // 10MB
  DOCUMENT_MAX_SIZE: 50 * 1024 * 1024, // 50MB
  AVATAR_MAX_SIZE: 2 * 1024 * 1024 // 2MB
};

// Supported file types
export const SUPPORTED_FILE_TYPES = {
  IMAGES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  DOCUMENTS: ['application/pdf', 'text/plain', 'text/markdown'],
  CODE: ['application/javascript', 'text/x-python', 'text/html', 'text/css']
};

// Validation rules
export const VALIDATION_RULES = {
  USERNAME: {
    MIN_LENGTH: 3,
    MAX_LENGTH: 20,
    PATTERN: /^[a-zA-Z0-9_-]+$/
  },
  PASSWORD: {
    MIN_LENGTH: 6,
    MAX_LENGTH: 128
  },
  EMAIL: {
    PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  }
};

// Error messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error - please check your connection',
  UNAUTHORIZED: 'You are not authorized to perform this action',
  FORBIDDEN: 'Access denied',
  NOT_FOUND: 'Resource not found',
  SERVER_ERROR: 'Internal server error - please try again later',
  VALIDATION_ERROR: 'Please check your input and try again'
};

// Success messages
export const SUCCESS_MESSAGES = {
  LOGIN: 'Successfully logged in',
  LOGOUT: 'Successfully logged out',
  REGISTER: 'Account created successfully',
  FILE_SAVED: 'File saved successfully',
  SETTINGS_UPDATED: 'Settings updated successfully'
};
```

## Performance Utilities (performance.js)

### Performance Monitoring

```javascript
// Performance measurement utilities
export const performanceUtils = {
  // Mark performance timing
  mark: (name) => {
    if (window.performance && window.performance.mark) {
      window.performance.mark(name);
    }
  },

  // Measure performance between marks
  measure: (name, startMark, endMark) => {
    if (window.performance && window.performance.measure) {
      try {
        window.performance.measure(name, startMark, endMark);
        const measure = window.performance.getEntriesByName(name)[0];
        return measure.duration;
      } catch (error) {
        console.warn('Performance measurement failed:', error);
        return null;
      }
    }
    return null;
  },

  // Time function execution
  timeFunction: async (fn, label = 'function') => {
    const startTime = performance.now();
    const result = await fn();
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    console.log(`${label} took ${duration.toFixed(2)}ms`);
    return { result, duration };
  },

  // Memory usage (if available)
  getMemoryUsage: () => {
    if (window.performance && window.performance.memory) {
      return {
        used: window.performance.memory.usedJSHeapSize,
        total: window.performance.memory.totalJSHeapSize,
        limit: window.performance.memory.jsHeapSizeLimit
      };
    }
    return null;
  },

  // Clear performance entries
  clearMarks: (name) => {
    if (window.performance && window.performance.clearMarks) {
      window.performance.clearMarks(name);
    }
  },

  clearMeasures: (name) => {
    if (window.performance && window.performance.clearMeasures) {
      window.performance.clearMeasures(name);
    }
  }
};

// Bundle size analysis utilities
export const bundleUtils = {
  // Analyze import sizes (development only)
  analyzeImports: () => {
    if (process.env.NODE_ENV === 'development') {
      console.log('Bundle analysis available in development mode');
      // Could integrate with webpack-bundle-analyzer
    }
  },

  // Lazy loading helper
  lazyLoad: (importFn) => {
    return React.lazy(() => {
      const start = performance.now();
      return importFn().then(module => {
        const end = performance.now();
        console.log(`Lazy loaded module in ${(end - start).toFixed(2)}ms`);
        return module;
      });
    });
  }
};

// Debounce and throttle utilities
export const optimizationUtils = {
  // Debounce function calls
  debounce: (func, wait, immediate = false) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        timeout = null;
        if (!immediate) func(...args);
      };
      const callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) func(...args);
    };
  },

  // Throttle function calls
  throttle: (func, limit) => {
    let inThrottle;
    return function executedFunction(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  // Memoization helper
  memoize: (fn, getKey = (...args) => JSON.stringify(args)) => {
    const cache = new Map();
    return (...args) => {
      const key = getKey(...args);
      if (cache.has(key)) {
        return cache.get(key);
      }
      const result = fn(...args);
      cache.set(key, result);
      return result;
    };
  }
};
```

## Clipboard Utilities (clipboard.js)

### Clipboard Operations

```javascript
export const clipboardUtils = {
  // Copy text to clipboard
  copyText: async (text) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return { success: true };
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        const successful = document.execCommand('copy');
        textArea.remove();
        
        return { success: successful };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Read from clipboard
  readText: async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        const text = await navigator.clipboard.readText();
        return { success: true, text };
      } else {
        return { success: false, error: 'Clipboard read not supported' };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Copy with user feedback
  copyWithFeedback: async (text, showNotification = true) => {
    const result = await clipboardUtils.copyText(text);
    
    if (showNotification) {
      if (result.success) {
        // Could integrate with toast notification system
        console.log('Copied to clipboard');
      } else {
        console.error('Failed to copy:', result.error);
      }
    }
    
    return result;
  }
};
```

---

*These utility functions provide a comprehensive foundation for the Claude Code UI application, offering reusable, testable, and well-documented functionality that enhances development efficiency and code quality.*