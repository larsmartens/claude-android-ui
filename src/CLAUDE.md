# Frontend Architecture Documentation

## Overview

The frontend is a modern React 18 application built with Vite, providing an intuitive and responsive interface for Claude CLI interactions. The architecture emphasizes component reusability, state management efficiency, and mobile-first design principles optimized for Android/Termux environments.

## Frontend Structure

```
src/
├── main.jsx              # Application entry point and root setup
├── App.jsx               # Main application component and routing
├── index.css             # Global styles and Tailwind CSS imports
├── components/           # Reusable UI components
├── contexts/             # React context providers for global state
├── hooks/                # Custom React hooks for shared logic
├── utils/                # Utility functions and API clients
└── lib/                  # External library configurations and utils
```

## Technology Stack

### Core Framework
- **React 18.2.0**: Latest React with concurrent features
- **React Router 6.8.1**: Client-side routing and navigation
- **Vite 7.0.4**: Fast build tool and development server

### Styling and UI
- **Tailwind CSS 3.4.0**: Utility-first CSS framework
- **@tailwindcss/typography**: Enhanced typography support
- **Tailwind Merge**: Dynamic class merging utilities
- **Class Variance Authority**: Type-safe variant styling

### Code Editing and Terminal
- **CodeMirror 6**: Modern code editor with syntax highlighting
- **XTerm.js 5.3.0**: Terminal emulator for web browsers
- **React Markdown**: Markdown rendering with syntax highlighting

### State Management
- **React Context**: Global state management
- **Custom Hooks**: Encapsulated stateful logic
- **Local Storage**: Persistent client-side storage

## Application Architecture

### Main Application (App.jsx)

#### Router Configuration
```javascript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

const App = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <ErrorBoundary>
            <Routes>
              <Route path="/login" element={<LoginForm />} />
              <Route path="/setup" element={<SetupForm />} />
              <Route path="/*" element={
                <ProtectedRoute>
                  <MainContent />
                </ProtectedRoute>
              } />
            </Routes>
          </ErrorBoundary>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};
```

#### Global Providers Hierarchy
```javascript
<AuthProvider>           // Authentication state and user management
  <ThemeProvider>        // Dark/light mode and theme persistence
    <ErrorBoundary>      // Global error catching and recovery
      <MainContent>      // Main application interface
    </ErrorBoundary>
  </ThemeProvider>
</AuthProvider>
```

### Component Architecture

#### Layout Structure
```javascript
<MainContent>
  <Sidebar>              // Project navigation and status
    <ClaudeStatus />     // Connection and session status
    <ProjectList />      // Project browser and selection
    <GitPanel />         // Git operations interface
  </Sidebar>
  
  <MainArea>
    <TabNavigation />    // Chat/Shell/Files tab switching
    <TabContent>
      <ChatInterface />  // Claude conversation interface
      <Shell />          // Terminal emulation
      <FileTree />       // File browser and editor
    </TabContent>
  </MainArea>
</MainContent>
```

#### Responsive Design Pattern
```javascript
// Mobile-first responsive design
const ResponsiveLayout = () => {
  const [isMobile] = useMediaQuery('(max-width: 768px)');
  
  return (
    <div className="flex flex-col lg:flex-row h-screen">
      {/* Mobile: Collapsible sidebar */}
      <Sidebar className={`
        ${isMobile ? 'w-full lg:w-64' : 'w-64'}
        ${isMobile && !sidebarOpen ? 'hidden' : 'block'}
      `} />
      
      {/* Main content adapts to sidebar state */}
      <MainArea className="flex-1 min-w-0" />
    </div>
  );
};
```

## State Management

### Authentication Context

#### Auth State Structure
```javascript
const AuthContext = createContext({
  user: null,              // Current user object
  token: null,             // JWT authentication token
  isAuthenticated: false,  // Authentication status
  isLoading: true,         // Loading state
  login: () => {},         // Login function
  logout: () => {},        // Logout function
  checkAuth: () => {}      // Token validation function
});
```

#### Authentication Flow
```javascript
const useAuth = () => {
  const [authState, setAuthState] = useState({
    user: null,
    token: localStorage.getItem('auth-token'),
    isAuthenticated: false,
    isLoading: true
  });
  
  const login = async (credentials) => {
    try {
      const response = await api.post('/auth/login', credentials);
      const { user, token } = response.data;
      
      localStorage.setItem('auth-token', token);
      setAuthState({
        user,
        token,
        isAuthenticated: true,
        isLoading: false
      });
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };
  
  const logout = () => {
    localStorage.removeItem('auth-token');
    setAuthState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false
    });
  };
  
  return { ...authState, login, logout };
};
```

### Theme Context

#### Theme Management
```javascript
const ThemeContext = createContext({
  theme: 'dark',           // 'light' | 'dark' | 'system'
  isDark: true,            // Computed dark mode state
  toggleTheme: () => {},   // Theme toggle function
  setTheme: () => {}       // Direct theme setter
});

const useTheme = () => {
  const [theme, setTheme] = useState(() => 
    localStorage.getItem('theme') || 'system'
  );
  
  const isDark = useMemo(() => {
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return theme === 'dark';
  }, [theme]);
  
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem('theme', theme);
  }, [theme, isDark]);
  
  return { theme, isDark, setTheme, toggleTheme: () => 
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  };
};
```

## Component Patterns

### Higher-Order Components

#### Protected Route Component
```javascript
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  
  if (isLoading) {
    return <LoadingSpinner />;
  }
  
  if (!isAuthenticated) {
    // Redirect to login with return URL
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  return children;
};
```

#### Error Boundary Component
```javascript
class ErrorBoundary extends Component {
  state = { hasError: false, error: null };
  
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  
  componentDidCatch(error, errorInfo) {
    console.error('Frontend error caught:', error, errorInfo);
    // In production, send to error reporting service
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback 
          error={this.state.error}
          resetError={() => this.setState({ hasError: false, error: null })}
        />
      );
    }
    
    return this.props.children;
  }
}
```

### Custom Hooks Pattern

#### WebSocket Connection Hook
```javascript
const useWebSocket = (url, options = {}) => {
  const [socket, setSocket] = useState(null);
  const [connectionState, setConnectionState] = useState('disconnected');
  const [lastMessage, setLastMessage] = useState(null);
  
  const connect = useCallback(() => {
    if (socket?.readyState === WebSocket.OPEN) return;
    
    const ws = new WebSocket(url);
    
    ws.onopen = () => {
      setConnectionState('connected');
      options.onOpen?.(ws);
    };
    
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      setLastMessage(message);
      options.onMessage?.(message);
    };
    
    ws.onclose = () => {
      setConnectionState('disconnected');
      options.onClose?.();
    };
    
    ws.onerror = (error) => {
      setConnectionState('error');
      options.onError?.(error);
    };
    
    setSocket(ws);
  }, [url, options]);
  
  const disconnect = useCallback(() => {
    socket?.close();
    setSocket(null);
  }, [socket]);
  
  const sendMessage = useCallback((message) => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }, [socket]);
  
  return {
    socket,
    connectionState,
    lastMessage,
    connect,
    disconnect,
    sendMessage
  };
};
```

#### Persistent State Hook
```javascript
const usePersistentState = (key, defaultValue) => {
  const [state, setState] = useState(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  });
  
  const setValue = useCallback((value) => {
    try {
      setState(value);
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Error saving to localStorage:`, error);
    }
  }, [key]);
  
  return [state, setValue];
};
```

## Component Communication

### Event-Driven Architecture

#### Global Event System
```javascript
// Custom event bus for cross-component communication
const eventBus = {
  events: {},
  
  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
    
    // Return unsubscribe function
    return () => {
      this.events[event] = this.events[event].filter(cb => cb !== callback);
    };
  },
  
  emit(event, data) {
    if (this.events[event]) {
      this.events[event].forEach(callback => callback(data));
    }
  }
};

// Usage in components
const useEventBus = (event, handler) => {
  useEffect(() => {
    return eventBus.on(event, handler);
  }, [event, handler]);
  
  const emit = useCallback((data) => {
    eventBus.emit(event, data);
  }, [event]);
  
  return emit;
};
```

#### Component Communication Patterns
```javascript
// Parent-to-child: Props
<ChildComponent 
  data={parentData}
  onAction={handleChildAction}
/>

// Child-to-parent: Callback props
const ChildComponent = ({ onAction }) => {
  const handleClick = () => {
    onAction({ type: 'click', data: 'value' });
  };
};

// Sibling-to-sibling: Context or event bus
const ComponentA = () => {
  const emitEvent = useEventBus('component-event');
  return <button onClick={() => emitEvent('data')}>Send</button>;
};

const ComponentB = () => {
  useEventBus('component-event', (data) => {
    console.log('Received:', data);
  });
  return <div>Listening...</div>;
};
```

## Performance Optimizations

### React Performance Patterns

#### Memoization Strategies
```javascript
// Component memoization
const ExpensiveComponent = React.memo(({ data, options }) => {
  return <ComplexUI data={data} options={options} />;
}, (prevProps, nextProps) => {
  // Custom comparison function
  return prevProps.data.id === nextProps.data.id &&
         JSON.stringify(prevProps.options) === JSON.stringify(nextProps.options);
});

// Hook memoization
const useMemoizedData = (rawData, filters) => {
  return useMemo(() => {
    return rawData
      .filter(item => filters.includes(item.type))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [rawData, filters]);
};

// Callback memoization
const ParentComponent = () => {
  const handleChildAction = useCallback((actionData) => {
    // Stable callback reference
    processAction(actionData);
  }, []); // Empty dependency array for stable reference
  
  return <ChildComponent onAction={handleChildAction} />;
};
```

#### Code Splitting and Lazy Loading
```javascript
// Route-level code splitting
const ChatInterface = lazy(() => import('./components/ChatInterface'));
const Shell = lazy(() => import('./components/Shell'));
const FileTree = lazy(() => import('./components/FileTree'));

const App = () => (
  <Suspense fallback={<LoadingSpinner />}>
    <Routes>
      <Route path="/chat" element={<ChatInterface />} />
      <Route path="/shell" element={<Shell />} />
      <Route path="/files" element={<FileTree />} />
    </Routes>
  </Suspense>
);

// Component-level code splitting
const HeavyComponent = lazy(() => 
  import('./HeavyComponent').then(module => ({
    default: module.HeavyComponent
  }))
);
```

### Bundle Optimization

#### Tree Shaking Configuration
```javascript
// vite.config.js
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          editor: ['@codemirror/state', '@codemirror/view'],
          terminal: ['xterm', 'xterm-addon-fit']
        }
      }
    }
  }
});
```

#### Dynamic Imports
```javascript
// Load heavy libraries only when needed
const loadCodeMirror = async () => {
  const [
    { EditorView },
    { basicSetup },
    { javascript }
  ] = await Promise.all([
    import('@codemirror/view'),
    import('@codemirror/basic-setup'),
    import('@codemirror/lang-javascript')
  ]);
  
  return { EditorView, basicSetup, javascript };
};
```

## Mobile and Touch Optimizations

### Touch Interface Adaptations

#### Touch-Friendly Components
```javascript
const TouchButton = ({ onPress, children, ...props }) => {
  const [isPressed, setIsPressed] = useState(false);
  
  return (
    <button
      {...props}
      className={`
        touch-manipulation select-none
        min-h-[44px] min-w-[44px]  // Minimum touch target size
        ${isPressed ? 'bg-gray-200' : 'bg-white'}
        transition-colors duration-150
      `}
      onTouchStart={() => setIsPressed(true)}
      onTouchEnd={() => setIsPressed(false)}
      onTouchCancel={() => setIsPressed(false)}
      onClick={onPress}
    >
      {children}
    </button>
  );
};
```

#### Responsive Design Utilities
```javascript
const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(false);
  
  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);
    
    const handler = (event) => setMatches(event.matches);
    mediaQuery.addEventListener('change', handler);
    
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);
  
  return matches;
};

// Usage
const isMobile = useMediaQuery('(max-width: 768px)');
const isTablet = useMediaQuery('(min-width: 769px) and (max-width: 1024px)');
const isDesktop = useMediaQuery('(min-width: 1025px)');
```

### Viewport Management

#### Safe Area Handling
```css
/* CSS custom properties for safe areas */
:root {
  --safe-area-inset-top: env(safe-area-inset-top);
  --safe-area-inset-bottom: env(safe-area-inset-bottom);
  --safe-area-inset-left: env(safe-area-inset-left);
  --safe-area-inset-right: env(safe-area-inset-right);
}

.safe-area {
  padding-top: var(--safe-area-inset-top);
  padding-bottom: var(--safe-area-inset-bottom);
  padding-left: var(--safe-area-inset-left);
  padding-right: var(--safe-area-inset-right);
}
```

#### Keyboard Handling
```javascript
const useKeyboardHeight = () => {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  
  useEffect(() => {
    const handleResize = () => {
      if (window.visualViewport) {
        const heightDiff = window.screen.height - window.visualViewport.height;
        setKeyboardHeight(Math.max(0, heightDiff));
      }
    };
    
    window.visualViewport?.addEventListener('resize', handleResize);
    return () => window.visualViewport?.removeEventListener('resize', handleResize);
  }, []);
  
  return keyboardHeight;
};
```

## Development Tools

### Development Environment

#### Hot Module Replacement
```javascript
// Vite HMR configuration
if (import.meta.hot) {
  import.meta.hot.accept('./App.jsx', (newModule) => {
    // Handle component updates
    updateRoot(newModule.default);
  });
  
  import.meta.hot.accept('./contexts/AuthContext.jsx', () => {
    // Preserve authentication state during HMR
    console.log('AuthContext updated');
  });
}
```

#### Development-Only Features
```javascript
const DevTools = () => {
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }
  
  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button onClick={() => window.location.reload()}>
        🔄 Reload
      </button>
      <button onClick={() => localStorage.clear()}>
        🗑️ Clear Storage
      </button>
    </div>
  );
};
```

### Testing Utilities

#### Component Testing Helpers
```javascript
const renderWithProviders = (component, options = {}) => {
  const {
    initialAuth = null,
    initialTheme = 'light',
    ...renderOptions
  } = options;
  
  const Wrapper = ({ children }) => (
    <BrowserRouter>
      <AuthProvider initialState={initialAuth}>
        <ThemeProvider initialTheme={initialTheme}>
          {children}
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
  
  return render(component, { wrapper: Wrapper, ...renderOptions });
};
```

## Security Considerations

### Client-Side Security

#### XSS Prevention
```javascript
// Sanitize user input before rendering
import DOMPurify from 'dompurify';

const SafeHTML = ({ content }) => {
  const sanitizedContent = DOMPurify.sanitize(content);
  return <div dangerouslySetInnerHTML={{ __html: sanitizedContent }} />;
};
```

#### Token Storage Security
```javascript
const secureStorage = {
  setItem(key, value) {
    try {
      // Consider using secure storage mechanisms
      localStorage.setItem(key, value);
    } catch (error) {
      console.error('Storage error:', error);
    }
  },
  
  getItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.error('Storage retrieval error:', error);
      return null;
    }
  },
  
  removeItem(key) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Storage removal error:', error);
    }
  }
};
```

---

*This frontend architecture provides a scalable, maintainable, and performant foundation for the Claude Code UI, with special attention to mobile usability and Android/Termux optimization.*