# Custom React Hooks Documentation

## Overview

The hooks directory contains custom React hooks that encapsulate stateful logic and provide reusable functionality across components. These hooks abstract complex operations like WebSocket connections, local storage persistence, API calls, and UI interactions to promote code reuse and maintainability.

## Hooks Structure

```
src/hooks/
├── useWebSocket.js      # WebSocket connection and message handling
├── useLocalStorage.js   # Persistent local storage state management
├── useApi.js           # Simplified API calls with error handling
├── useDebounce.js      # Input debouncing for performance
├── useMediaQuery.js    # Responsive design breakpoint detection
├── useKeyboard.js      # Keyboard shortcuts and event handling
├── useFileUpload.js    # File upload and drag-and-drop functionality
└── useClipboard.js     # Clipboard operations and feedback
```

## WebSocket Hook (useWebSocket.js)

### Connection Management

#### Hook Interface
```javascript
const useWebSocket = (url, options = {}) => {
  return {
    // Connection state
    socket: WebSocket | null,
    connectionState: 'disconnected' | 'connecting' | 'connected' | 'error',
    lastMessage: object | null,
    
    // Connection control
    connect: () => void,
    disconnect: () => void,
    reconnect: () => void,
    
    // Message handling
    sendMessage: (message: object) => void,
    subscribe: (eventType: string, handler: function) => unsubscribe,
    
    // Connection info
    readyState: number,
    url: string
  };
};
```

#### Implementation
```javascript
import { useState, useRef, useCallback, useEffect } from 'react';

export const useWebSocket = (url, options = {}) => {
  const {
    onOpen = null,
    onMessage = null,
    onClose = null,
    onError = null,
    reconnectAttempts = 5,
    reconnectInterval = 3000,
    heartbeatInterval = 30000
  } = options;

  const [connectionState, setConnectionState] = useState('disconnected');
  const [lastMessage, setLastMessage] = useState(null);
  
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const heartbeatTimeoutRef = useRef(null);
  const reconnectCountRef = useRef(0);
  const eventSubscriptionsRef = useRef(new Map());

  // Connection establishment
  const connect = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      console.warn('WebSocket already connected');
      return;
    }

    try {
      setConnectionState('connecting');
      socketRef.current = new WebSocket(url);

      socketRef.current.onopen = (event) => {
        console.log('WebSocket connected');
        setConnectionState('connected');
        reconnectCountRef.current = 0;
        
        // Start heartbeat
        startHeartbeat();
        
        onOpen?.(event);
      };

      socketRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          setLastMessage(message);
          
          // Handle heartbeat responses
          if (message.type === 'pong') {
            resetHeartbeat();
            return;
          }
          
          // Call subscribed handlers
          const handlers = eventSubscriptionsRef.current.get(message.type) || [];
          handlers.forEach(handler => {
            try {
              handler(message);
            } catch (error) {
              console.error('Message handler error:', error);
            }
          });
          
          // Call global message handler
          onMessage?.(message);
          
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      socketRef.current.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        setConnectionState('disconnected');
        stopHeartbeat();
        
        // Attempt reconnection if not intentional close
        if (event.code !== 1000 && reconnectCountRef.current < reconnectAttempts) {
          scheduleReconnect();
        }
        
        onClose?.(event);
      };

      socketRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionState('error');
        onError?.(error);
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      setConnectionState('error');
    }
  }, [url, onOpen, onMessage, onClose, onError, reconnectAttempts]);

  // Graceful disconnection
  const disconnect = useCallback(() => {
    clearTimeout(reconnectTimeoutRef.current);
    stopHeartbeat();
    
    if (socketRef.current) {
      socketRef.current.close(1000, 'Intentional close');
      socketRef.current = null;
    }
    
    setConnectionState('disconnected');
  }, []);

  // Force reconnection
  const reconnect = useCallback(() => {
    disconnect();
    setTimeout(connect, 100);
  }, [disconnect, connect]);

  // Automatic reconnection
  const scheduleReconnect = useCallback(() => {
    if (reconnectCountRef.current >= reconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }
    
    reconnectCountRef.current++;
    const delay = reconnectInterval * Math.pow(1.5, reconnectCountRef.current - 1);
    
    console.log(`Reconnecting in ${delay}ms (attempt ${reconnectCountRef.current})`);
    
    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
    }, delay);
  }, [connect, reconnectAttempts, reconnectInterval]);

  // Heartbeat mechanism
  const startHeartbeat = useCallback(() => {
    if (heartbeatInterval <= 0) return;
    
    heartbeatTimeoutRef.current = setTimeout(() => {
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        sendMessage({ type: 'ping', timestamp: Date.now() });
        
        // Expect pong within reasonable time
        setTimeout(() => {
          if (connectionState === 'connected') {
            console.warn('Heartbeat timeout, reconnecting...');
            reconnect();
          }
        }, 5000);
      }
    }, heartbeatInterval);
  }, [heartbeatInterval, connectionState, reconnect]);

  const resetHeartbeat = useCallback(() => {
    clearTimeout(heartbeatTimeoutRef.current);
    startHeartbeat();
  }, [startHeartbeat]);

  const stopHeartbeat = useCallback(() => {
    clearTimeout(heartbeatTimeoutRef.current);
  }, []);

  // Message sending
  const sendMessage = useCallback((message) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      try {
        const jsonMessage = JSON.stringify(message);
        socketRef.current.send(jsonMessage);
        return true;
      } catch (error) {
        console.error('Failed to send WebSocket message:', error);
        return false;
      }
    } else {
      console.warn('WebSocket not connected, message not sent:', message);
      return false;
    }
  }, []);

  // Event subscription system
  const subscribe = useCallback((eventType, handler) => {
    const subscribers = eventSubscriptionsRef.current.get(eventType) || [];
    subscribers.push(handler);
    eventSubscriptionsRef.current.set(eventType, subscribers);
    
    // Return unsubscribe function
    return () => {
      const currentSubscribers = eventSubscriptionsRef.current.get(eventType) || [];
      const filteredSubscribers = currentSubscribers.filter(h => h !== handler);
      
      if (filteredSubscribers.length > 0) {
        eventSubscriptionsRef.current.set(eventType, filteredSubscribers);
      } else {
        eventSubscriptionsRef.current.delete(eventType);
      }
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
      clearTimeout(reconnectTimeoutRef.current);
    };
  }, [disconnect]);

  return {
    socket: socketRef.current,
    connectionState,
    lastMessage,
    connect,
    disconnect,
    reconnect,
    sendMessage,
    subscribe,
    readyState: socketRef.current?.readyState ?? WebSocket.CLOSED,
    url
  };
};
```

### Usage Patterns
```javascript
// Basic chat WebSocket
const ChatComponent = () => {
  const { 
    connectionState, 
    sendMessage, 
    subscribe,
    connect 
  } = useWebSocket('/ws', {
    onOpen: () => console.log('Chat connected'),
    reconnectAttempts: 3
  });

  useEffect(() => {
    connect();
    
    // Subscribe to specific message types
    const unsubscribeClaude = subscribe('claude-response', (message) => {
      setMessages(prev => [...prev, message]);
    });
    
    const unsubscribeError = subscribe('error', (message) => {
      setError(message.error);
    });
    
    return () => {
      unsubscribeClaude();
      unsubscribeError();
    };
  }, []);

  const handleSendMessage = (text) => {
    sendMessage({
      type: 'claude-command',
      command: text,
      options: { projectPath: selectedProject?.fullPath }
    });
  };

  return (
    <div>
      <div>Status: {connectionState}</div>
      {/* Chat UI */}
    </div>
  );
};
```

## Local Storage Hook (useLocalStorage.js)

### Persistent State Management

#### Hook Interface
```javascript
const useLocalStorage = (key, defaultValue, options = {}) => {
  return [
    value,           // Current value
    setValue,        // Update function
    removeValue,     // Delete function
    loading,         // Initial load state
    error           // Serialization errors
  ];
};
```

#### Implementation
```javascript
import { useState, useEffect, useCallback } from 'react';

export const useLocalStorage = (key, defaultValue, options = {}) => {
  const {
    serialize = JSON.stringify,
    deserialize = JSON.parse,
    syncAcrossTabs = true,
    validator = null
  } = options;

  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item === null) {
        return defaultValue;
      }
      
      const parsed = deserialize(item);
      
      // Validate if validator provided
      if (validator && !validator(parsed)) {
        console.warn(`Invalid stored value for key: ${key}`);
        return defaultValue;
      }
      
      return parsed;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return defaultValue;
    }
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Update localStorage when value changes
  const setValue = useCallback((value) => {
    try {
      setError(null);
      setLoading(true);
      
      // Allow value to be a function for functional updates
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      
      // Validate if validator provided
      if (validator && !validator(valueToStore)) {
        throw new Error('Value failed validation');
      }
      
      setStoredValue(valueToStore);
      
      if (valueToStore === undefined || valueToStore === null) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, serialize(valueToStore));
      }
      
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
      setError(error);
    } finally {
      setLoading(false);
    }
  }, [key, serialize, storedValue, validator]);

  const removeValue = useCallback(() => {
    try {
      setError(null);
      window.localStorage.removeItem(key);
      setStoredValue(defaultValue);
    } catch (error) {
      console.error(`Error removing localStorage key "${key}":`, error);
      setError(error);
    }
  }, [key, defaultValue]);

  // Listen for storage changes from other tabs
  useEffect(() => {
    if (!syncAcrossTabs) return;

    const handleStorageChange = (e) => {
      if (e.key === key && e.newValue !== serialize(storedValue)) {
        try {
          const newValue = e.newValue ? deserialize(e.newValue) : defaultValue;
          
          if (validator && !validator(newValue)) {
            console.warn(`Invalid synced value for key: ${key}`);
            return;
          }
          
          setStoredValue(newValue);
        } catch (error) {
          console.error(`Error syncing localStorage key "${key}":`, error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key, defaultValue, serialize, deserialize, storedValue, syncAcrossTabs, validator]);

  return [storedValue, setValue, removeValue, loading, error];
};
```

### Usage Examples
```javascript
// Basic usage
const [theme, setTheme] = useLocalStorage('theme', 'dark');

// With validation
const [userSettings, setUserSettings] = useLocalStorage('settings', {}, {
  validator: (value) => typeof value === 'object' && value !== null
});

// With custom serialization
const [complexData, setComplexData] = useLocalStorage('complex', new Map(), {
  serialize: (value) => JSON.stringify([...value]),
  deserialize: (value) => new Map(JSON.parse(value))
});
```

## API Hook (useApi.js)

### Simplified API Calls

#### Hook Interface
```javascript
const useApi = () => {
  return {
    get: (url, options) => Promise,
    post: (url, data, options) => Promise,
    put: (url, data, options) => Promise,
    delete: (url, options) => Promise,
    upload: (url, file, options) => Promise,
    loading: boolean,
    error: Error | null,
    abort: () => void
  };
};
```

#### Implementation
```javascript
import { useState, useRef, useCallback } from 'react';

export const useApi = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  const makeRequest = useCallback(async (method, url, data = null, options = {}) => {
    try {
      setLoading(true);
      setError(null);

      // Create new abort controller
      abortControllerRef.current = new AbortController();

      const config = {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers
        },
        signal: abortControllerRef.current.signal,
        ...options
      };

      // Add authentication token if available
      const token = localStorage.getItem('auth-token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      // Add body for POST/PUT requests
      if (data && (method === 'POST' || method === 'PUT')) {
        if (data instanceof FormData) {
          // Remove Content-Type header for FormData
          delete config.headers['Content-Type'];
          config.body = data;
        } else {
          config.body = JSON.stringify(data);
        }
      }

      const response = await fetch(url, config);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      // Handle different response types
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        return await response.json();
      } else if (contentType?.includes('text/')) {
        return await response.text();
      } else {
        return await response.blob();
      }

    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Request aborted');
        return null;
      }
      
      setError(err);
      throw err;
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, []);

  const get = useCallback((url, options = {}) => {
    return makeRequest('GET', url, null, options);
  }, [makeRequest]);

  const post = useCallback((url, data, options = {}) => {
    return makeRequest('POST', url, data, options);
  }, [makeRequest]);

  const put = useCallback((url, data, options = {}) => {
    return makeRequest('PUT', url, data, options);
  }, [makeRequest]);

  const del = useCallback((url, options = {}) => {
    return makeRequest('DELETE', url, null, options);
  }, [makeRequest]);

  const upload = useCallback(async (url, file, options = {}) => {
    const formData = new FormData();
    formData.append('file', file);
    
    // Add additional fields if provided
    if (options.fields) {
      Object.entries(options.fields).forEach(([key, value]) => {
        formData.append(key, value);
      });
    }

    return makeRequest('POST', url, formData, {
      ...options,
      headers: {
        // Don't set Content-Type for FormData
        ...options.headers
      }
    });
  }, [makeRequest]);

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return {
    get,
    post,
    put,
    delete: del,
    upload,
    loading,
    error,
    abort
  };
};
```

### Usage with React Query Pattern
```javascript
// Custom hook combining useApi with state management
const useProjects = () => {
  const api = useApi();
  const [projects, setProjects] = useState([]);
  
  const fetchProjects = useCallback(async () => {
    try {
      const data = await api.get('/api/projects');
      setProjects(data);
      return data;
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      throw error;
    }
  }, [api]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  return {
    projects,
    loading: api.loading,
    error: api.error,
    refetch: fetchProjects,
    abort: api.abort
  };
};
```

## Debounce Hook (useDebounce.js)

### Performance Optimization

#### Implementation
```javascript
import { useState, useEffect } from 'react';

export const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

// Advanced debounce with callback
export const useDebounceCallback = (callback, delay) => {
  const timeoutRef = useRef(null);

  const debouncedCallback = useCallback((...args) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      callback(...args);
    }, delay);
  }, [callback, delay]);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
  }, []);

  const flush = useCallback((...args) => {
    cancel();
    callback(...args);
  }, [callback, cancel]);

  return { debouncedCallback, cancel, flush };
};
```

### Usage Examples
```javascript
// Search input optimization
const SearchComponent = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  useEffect(() => {
    if (debouncedSearchTerm) {
      performSearch(debouncedSearchTerm);
    }
  }, [debouncedSearchTerm]);

  return (
    <input
      value={searchTerm}
      onChange={(e) => setSearchTerm(e.target.value)}
      placeholder="Search..."
    />
  );
};

// API call debouncing
const AutoSaveEditor = () => {
  const [content, setContent] = useState('');
  const { debouncedCallback } = useDebounceCallback(saveContent, 1000);

  useEffect(() => {
    if (content) {
      debouncedCallback(content);
    }
  }, [content, debouncedCallback]);

  return (
    <textarea
      value={content}
      onChange={(e) => setContent(e.target.value)}
    />
  );
};
```

## Media Query Hook (useMediaQuery.js)

### Responsive Design

#### Implementation
```javascript
import { useState, useEffect } from 'react';

export const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);

    const handler = (event) => setMatches(event.matches);
    
    // Use modern addEventListener if available
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else {
      // Fallback for older browsers
      mediaQuery.addListener(handler);
      return () => mediaQuery.removeListener(handler);
    }
  }, [query]);

  return matches;
};

// Preset breakpoint hooks
export const useBreakpoint = () => {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const isLarge = useMediaQuery('(min-width: 1280px)');

  return { isMobile, isTablet, isDesktop, isLarge };
};
```

## File Upload Hook (useFileUpload.js)

### File Handling

#### Implementation
```javascript
import { useState, useCallback } from 'react';

export const useFileUpload = (options = {}) => {
  const {
    maxSize = 10 * 1024 * 1024, // 10MB default
    allowedTypes = ['image/*', 'text/*'],
    multiple = false,
    onUpload = null,
    onError = null
  } = options;

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const validateFile = useCallback((file) => {
    // Check file size
    if (file.size > maxSize) {
      throw new Error(`File size exceeds ${maxSize / 1024 / 1024}MB limit`);
    }

    // Check file type
    const isAllowed = allowedTypes.some(type => {
      if (type.endsWith('/*')) {
        return file.type.startsWith(type.slice(0, -1));
      }
      return file.type === type;
    });

    if (!isAllowed) {
      throw new Error(`File type ${file.type} not allowed`);
    }

    return true;
  }, [maxSize, allowedTypes]);

  const uploadFiles = useCallback(async (files) => {
    try {
      setUploading(true);
      setError(null);
      setProgress(0);

      const fileArray = Array.from(files);
      
      // Validate all files first
      fileArray.forEach(validateFile);

      const results = [];
      
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        
        try {
          // Create FormData
          const formData = new FormData();
          formData.append('file', file);

          // Upload with progress tracking
          const result = await uploadWithProgress(formData, (progressEvent) => {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            const overallProgress = ((i / fileArray.length) * 100) + (progress / fileArray.length);
            setProgress(overallProgress);
          });

          results.push({ file, result, success: true });
          onUpload?.(file, result);
          
        } catch (uploadError) {
          results.push({ file, error: uploadError, success: false });
          onError?.(uploadError, file);
        }
      }

      setProgress(100);
      return results;

    } catch (error) {
      setError(error);
      onError?.(error);
      throw error;
    } finally {
      setUploading(false);
    }
  }, [validateFile, onUpload, onError]);

  const uploadWithProgress = useCallback((formData, onProgress) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', onProgress);

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const result = JSON.parse(xhr.responseText);
            resolve(result);
          } catch {
            resolve(xhr.responseText);
          }
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed'));
      });

      xhr.open('POST', '/api/upload');
      
      // Add auth token if available
      const token = localStorage.getItem('auth-token');
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.send(formData);
    });
  }, []);

  // Drag and drop handlers
  const getDragProps = useCallback(() => ({
    onDragEnter: (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    onDragLeave: (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    onDragOver: (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    onDrop: (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        uploadFiles(multiple ? files : [files[0]]);
      }
    }
  }), [uploadFiles, multiple]);

  // File input props
  const getInputProps = useCallback(() => ({
    type: 'file',
    multiple,
    accept: allowedTypes.join(','),
    onChange: (e) => {
      const files = e.target.files;
      if (files.length > 0) {
        uploadFiles(files);
      }
      // Clear input to allow same file re-upload
      e.target.value = '';
    }
  }), [uploadFiles, multiple, allowedTypes]);

  return {
    uploading,
    progress,
    error,
    uploadFiles,
    getDragProps,
    getInputProps
  };
};
```

### Usage Example
```javascript
const FileUploadComponent = () => {
  const { uploading, progress, error, getDragProps, getInputProps } = useFileUpload({
    maxSize: 5 * 1024 * 1024, // 5MB
    allowedTypes: ['image/*'],
    onUpload: (file, result) => {
      console.log('File uploaded:', result);
    },
    onError: (error) => {
      console.error('Upload error:', error);
    }
  });

  return (
    <div {...getDragProps()} className="upload-area">
      <input {...getInputProps()} style={{ display: 'none' }} id="file-input" />
      <label htmlFor="file-input">
        {uploading ? (
          <div>
            <div>Uploading... {progress}%</div>
            <div className="progress-bar">
              <div style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <div>Click or drag files here</div>
        )}
      </label>
      {error && <div className="error">{error.message}</div>}
    </div>
  );
};
```

---

*These custom hooks provide powerful, reusable functionality that enhances the development experience and maintains consistent behavior across the Claude Code UI application.*