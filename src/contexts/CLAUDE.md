# React Contexts Documentation

## Overview

The contexts directory contains React Context providers that manage global application state across components. These contexts provide centralized state management for authentication, theme preferences, project selection, and application settings without requiring external state management libraries.

## Context Structure

```
src/contexts/
├── AuthContext.jsx      # Authentication and user session management
├── ThemeContext.jsx     # Dark/light mode and theme preferences
├── ProjectContext.jsx   # Current project and session state
└── SettingsContext.jsx  # Application configuration and preferences
```

## Authentication Context (AuthContext.jsx)

### Context Architecture

#### State Structure
```javascript
const AuthContext = createContext({
  // Authentication state
  user: null,              // Current user object { id, username }
  token: null,             // JWT authentication token
  isAuthenticated: false,  // Boolean authentication status
  isLoading: true,         // Initial authentication check loading
  
  // Authentication methods
  login: async () => {},   // Login with credentials
  logout: () => {},        // Clear authentication state
  register: async () => {},// User registration (initial setup)
  checkAuth: async () => {},// Validate existing token
  
  // Status information
  needsSetup: false,       // Whether initial user setup is required
  authError: null          // Last authentication error
});
```

#### Provider Implementation
```javascript
export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState({
    user: null,
    token: localStorage.getItem('auth-token'),
    isAuthenticated: false,
    isLoading: true,
    needsSetup: false,
    authError: null
  });

  // Initialize authentication state on mount
  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      // Check server status and authentication requirements
      const response = await api.get('/auth/status');
      const { needsSetup } = response.data;
      
      if (needsSetup) {
        setAuthState(prev => ({
          ...prev,
          needsSetup: true,
          isLoading: false
        }));
        return;
      }
      
      // Validate existing token if present
      const token = localStorage.getItem('auth-token');
      if (token) {
        await validateToken(token);
      } else {
        setAuthState(prev => ({
          ...prev,
          isLoading: false
        }));
      }
      
    } catch (error) {
      console.error('Auth initialization error:', error);
      setAuthState(prev => ({
        ...prev,
        isLoading: false,
        authError: error.message
      }));
    }
  };

  return (
    <AuthContext.Provider value={authValue}>
      {children}
    </AuthContext.Provider>
  );
};
```

### Authentication Methods

#### Login Flow
```javascript
const login = async (credentials) => {
  try {
    setAuthState(prev => ({ ...prev, isLoading: true, authError: null }));
    
    const response = await api.post('/auth/login', credentials);
    const { user, token } = response.data;
    
    // Store token persistently
    localStorage.setItem('auth-token', token);
    
    // Update authentication state
    setAuthState(prev => ({
      ...prev,
      user,
      token,
      isAuthenticated: true,
      isLoading: false,
      needsSetup: false
    }));
    
    // Configure API client with token
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    
    return { success: true };
    
  } catch (error) {
    const errorMessage = error.response?.data?.error || 'Login failed';
    setAuthState(prev => ({
      ...prev,
      isLoading: false,
      authError: errorMessage
    }));
    
    return { success: false, error: errorMessage };
  }
};
```

#### Registration Flow
```javascript
const register = async (credentials) => {
  try {
    setAuthState(prev => ({ ...prev, isLoading: true, authError: null }));
    
    const response = await api.post('/auth/register', credentials);
    const { user, token } = response.data;
    
    localStorage.setItem('auth-token', token);
    
    setAuthState(prev => ({
      ...prev,
      user,
      token,
      isAuthenticated: true,
      isLoading: false,
      needsSetup: false
    }));
    
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    
    return { success: true };
    
  } catch (error) {
    const errorMessage = error.response?.data?.error || 'Registration failed';
    setAuthState(prev => ({
      ...prev,
      isLoading: false,
      authError: errorMessage
    }));
    
    return { success: false, error: errorMessage };
  }
};
```

#### Token Validation
```javascript
const validateToken = async (token) => {
  try {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    
    const response = await api.get('/auth/user');
    const user = response.data;
    
    setAuthState(prev => ({
      ...prev,
      user,
      token,
      isAuthenticated: true,
      isLoading: false
    }));
    
    return true;
    
  } catch (error) {
    console.error('Token validation failed:', error);
    
    // Clear invalid token
    localStorage.removeItem('auth-token');
    delete api.defaults.headers.common['Authorization'];
    
    setAuthState(prev => ({
      ...prev,
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false
    }));
    
    return false;
  }
};
```

#### Logout Implementation
```javascript
const logout = () => {
  // Clear local storage
  localStorage.removeItem('auth-token');
  
  // Remove API authorization header
  delete api.defaults.headers.common['Authorization'];
  
  // Reset authentication state
  setAuthState({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: false,
    needsSetup: false,
    authError: null
  });
  
  // Optional: Call server logout endpoint
  api.post('/auth/logout').catch(console.error);
};
```

### Hook Usage Pattern
```javascript
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Component usage
const LoginForm = () => {
  const { login, isLoading, authError } = useAuth();
  
  const handleSubmit = async (credentials) => {
    const result = await login(credentials);
    if (result.success) {
      navigate('/dashboard');
    }
  };
  
  return (
    <form onSubmit={handleSubmit}>
      {authError && <div className="error">{authError}</div>}
      {/* Form fields */}
    </form>
  );
};
```

## Theme Context (ThemeContext.jsx)

### Theme Management

#### Theme State Structure
```javascript
const ThemeContext = createContext({
  // Current theme state
  theme: 'system',         // 'light' | 'dark' | 'system'
  isDark: false,           // Computed dark mode state
  
  // Theme controls
  setTheme: () => {},      // Set specific theme
  toggleTheme: () => {},   // Toggle between light/dark
  
  // System preferences
  systemPrefersDark: false // System color scheme preference
});
```

#### Provider Implementation
```javascript
export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    // Load saved theme preference
    const saved = localStorage.getItem('theme');
    return saved || 'system';
  });

  // Detect system color scheme preference
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // Computed dark mode state
  const isDark = useMemo(() => {
    if (theme === 'system') {
      return systemPrefersDark;
    }
    return theme === 'dark';
  }, [theme, systemPrefersDark]);

  // Listen for system color scheme changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e) => {
      setSystemPrefersDark(e.matches);
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    
    // Store theme preference
    localStorage.setItem('theme', theme);
  }, [theme, isDark]);

  const toggleTheme = useCallback(() => {
    setTheme(prevTheme => {
      if (prevTheme === 'system') {
        return systemPrefersDark ? 'light' : 'dark';
      }
      return prevTheme === 'dark' ? 'light' : 'dark';
    });
  }, [systemPrefersDark]);

  const value = {
    theme,
    isDark,
    systemPrefersDark,
    setTheme,
    toggleTheme
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
```

### Theme Hook
```javascript
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// Component usage
const ThemeToggle = () => {
  const { theme, isDark, toggleTheme, setTheme } = useTheme();
  
  return (
    <div className="theme-controls">
      <button onClick={toggleTheme}>
        {isDark ? '☀️' : '🌙'} {isDark ? 'Light' : 'Dark'}
      </button>
      
      <select value={theme} onChange={(e) => setTheme(e.target.value)}>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </div>
  );
};
```

## Project Context (ProjectContext.jsx)

### Project State Management

#### State Structure
```javascript
const ProjectContext = createContext({
  // Current selections
  selectedProject: null,     // Current project object
  selectedSession: null,     // Current session object
  
  // Available data
  projects: [],             // All discovered projects
  sessions: [],             // Sessions for selected project
  
  // Loading states
  projectsLoading: false,   // Loading projects list
  sessionsLoading: false,   // Loading sessions for project
  
  // Actions
  setSelectedProject: () => {},
  setSelectedSession: () => {},
  refreshProjects: () => {},
  refreshSessions: () => {}
});
```

#### Provider Implementation
```javascript
export const ProjectProvider = ({ children }) => {
  const [state, setState] = useState({
    selectedProject: null,
    selectedSession: null,
    projects: [],
    sessions: [],
    projectsLoading: true,
    sessionsLoading: false
  });

  // Load projects on mount
  useEffect(() => {
    refreshProjects();
  }, []);

  // Load sessions when project changes
  useEffect(() => {
    if (state.selectedProject) {
      refreshSessions();
    } else {
      setState(prev => ({ ...prev, sessions: [] }));
    }
  }, [state.selectedProject]);

  const refreshProjects = async () => {
    try {
      setState(prev => ({ ...prev, projectsLoading: true }));
      
      const response = await api.get('/projects');
      const projects = response.data;
      
      setState(prev => ({
        ...prev,
        projects,
        projectsLoading: false
      }));
      
    } catch (error) {
      console.error('Failed to load projects:', error);
      setState(prev => ({ ...prev, projectsLoading: false }));
    }
  };

  const refreshSessions = async () => {
    if (!state.selectedProject) return;
    
    try {
      setState(prev => ({ ...prev, sessionsLoading: true }));
      
      const response = await api.get(`/projects/${state.selectedProject.name}/sessions`);
      const sessions = response.data;
      
      setState(prev => ({
        ...prev,
        sessions,
        sessionsLoading: false
      }));
      
    } catch (error) {
      console.error('Failed to load sessions:', error);
      setState(prev => ({ ...prev, sessionsLoading: false }));
    }
  };

  const setSelectedProject = useCallback((project) => {
    setState(prev => ({
      ...prev,
      selectedProject: project,
      selectedSession: null // Clear session when project changes
    }));
  }, []);

  const setSelectedSession = useCallback((session) => {
    setState(prev => ({
      ...prev,
      selectedSession: session
    }));
  }, []);

  const value = {
    ...state,
    setSelectedProject,
    setSelectedSession,
    refreshProjects,
    refreshSessions
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
};
```

### WebSocket Integration
```javascript
// Listen for real-time project updates
useEffect(() => {
  const handleProjectUpdate = (data) => {
    if (data.type === 'projects_updated') {
      refreshProjects();
    } else if (data.type === 'session_created' && data.projectName === state.selectedProject?.name) {
      refreshSessions();
    }
  };
  
  // Subscribe to WebSocket events
  const unsubscribe = subscribeToProjectUpdates(handleProjectUpdate);
  return unsubscribe;
}, [state.selectedProject]);
```

## Settings Context (SettingsContext.jsx)

### Application Settings

#### Settings Structure
```javascript
const SettingsContext = createContext({
  // Editor settings
  fontSize: 14,
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  tabSize: 2,
  wordWrap: true,
  
  // Terminal settings
  terminalTheme: 'dark',
  shellPath: '/bin/bash',
  
  // UI preferences
  sidebarWidth: 256,
  showLineNumbers: true,
  autoSave: true,
  
  // Update methods
  updateSetting: () => {},
  resetSettings: () => {},
  exportSettings: () => {},
  importSettings: () => {}
});
```

#### Persistent Settings
```javascript
export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem('app-settings');
      return saved ? JSON.parse(saved) : defaultSettings;
    } catch {
      return defaultSettings;
    }
  });

  // Persist settings changes
  useEffect(() => {
    localStorage.setItem('app-settings', JSON.stringify(settings));
  }, [settings]);

  const updateSetting = useCallback((key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  }, []);

  const updateMultipleSettings = useCallback((updates) => {
    setSettings(prev => ({
      ...prev,
      ...updates
    }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(defaultSettings);
    localStorage.removeItem('app-settings');
  }, []);

  const exportSettings = useCallback(() => {
    const dataStr = JSON.stringify(settings, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'claude-ui-settings.json';
    link.click();
    
    URL.revokeObjectURL(url);
  }, [settings]);

  const importSettings = useCallback((file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const importedSettings = JSON.parse(e.target.result);
          
          // Validate settings structure
          const validatedSettings = validateSettings(importedSettings);
          
          setSettings(validatedSettings);
          resolve(validatedSettings);
        } catch (error) {
          reject(new Error('Invalid settings file'));
        }
      };
      
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }, []);

  const value = {
    ...settings,
    updateSetting,
    updateMultipleSettings,
    resetSettings,
    exportSettings,
    importSettings
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};
```

### Settings Validation
```javascript
const validateSettings = (settings) => {
  const validated = { ...defaultSettings };
  
  // Type validation for each setting
  Object.keys(defaultSettings).forEach(key => {
    if (settings.hasOwnProperty(key)) {
      const defaultType = typeof defaultSettings[key];
      const providedType = typeof settings[key];
      
      if (defaultType === providedType) {
        // Additional validation for specific settings
        if (key === 'fontSize' && (settings[key] < 8 || settings[key] > 32)) {
          return; // Keep default
        }
        if (key === 'tabSize' && (settings[key] < 1 || settings[key] > 8)) {
          return; // Keep default
        }
        
        validated[key] = settings[key];
      }
    }
  });
  
  return validated;
};
```

## Context Composition Pattern

### Provider Hierarchy
```javascript
const App = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <SettingsProvider>
            <ProjectProvider>
              <ErrorBoundary>
                <MainContent />
              </ErrorBoundary>
            </ProjectProvider>
          </SettingsProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
};
```

### Context Dependencies
```javascript
// ProjectProvider depends on AuthProvider for API authentication
const ProjectProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  
  useEffect(() => {
    if (isAuthenticated) {
      refreshProjects();
    }
  }, [isAuthenticated]);
  
  // ... rest of implementation
};
```

### Cross-Context Communication
```javascript
// Using multiple contexts in a component
const Dashboard = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const { selectedProject } = useProject();
  const { fontSize, showLineNumbers } = useSettings();
  
  return (
    <div className={`dashboard ${isDark ? 'dark' : 'light'}`}>
      <header>Welcome, {user.username}</header>
      <main style={{ fontSize }}>
        {selectedProject && (
          <ProjectView 
            project={selectedProject}
            showLineNumbers={showLineNumbers}
          />
        )}
      </main>
    </div>
  );
};
```

## Performance Optimizations

### Context Splitting
```javascript
// Split large contexts to prevent unnecessary re-renders
const AuthStateContext = createContext();
const AuthActionsContext = createContext();

// Components only re-render when their specific context changes
const useAuthState = () => useContext(AuthStateContext);
const useAuthActions = () => useContext(AuthActionsContext);
```

### Memoization
```javascript
// Memoize context values to prevent re-renders
const AuthProvider = ({ children }) => {
  // ... state logic
  
  const actions = useMemo(() => ({
    login,
    logout,
    register,
    checkAuth
  }), []);
  
  const state = useMemo(() => ({
    user,
    token,
    isAuthenticated,
    isLoading,
    needsSetup,
    authError
  }), [user, token, isAuthenticated, isLoading, needsSetup, authError]);
  
  return (
    <AuthStateContext.Provider value={state}>
      <AuthActionsContext.Provider value={actions}>
        {children}
      </AuthActionsContext.Provider>
    </AuthStateContext.Provider>
  );
};
```

### Selective Subscriptions
```javascript
// Custom hook for subscribing to specific context values
const useAuthSelector = (selector) => {
  const state = useAuthState();
  return selector(state);
};

// Component only re-renders when username changes
const UserGreeting = () => {
  const username = useAuthSelector(state => state.user?.username);
  return <div>Hello, {username}</div>;
};
```

---

*These React contexts provide a scalable and maintainable state management solution for the Claude Code UI, with careful attention to performance and cross-context dependencies.*