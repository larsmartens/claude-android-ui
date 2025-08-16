# UI Components Documentation

## Overview

The components directory contains all React UI components for the Claude Code UI frontend. Components are organized by functionality and follow consistent design patterns, with special attention to mobile responsiveness and accessibility.

## Component Structure

```
src/components/
├── App.jsx                  # Main application component
├── MainContent.jsx          # Main layout and content area
├── Sidebar.jsx              # Navigation sidebar
├── MobileNav.jsx            # Mobile navigation component
├── ClaudeStatus.jsx         # Claude connection status indicator
├── ClaudeLogo.jsx           # Claude branding component
├── CursorLogo.jsx           # Cursor branding component (v1.7.0)
├── ChatInterface.jsx        # Claude conversation interface
├── Shell.jsx                # Terminal emulation component
├── FileTree.jsx             # File browser and navigation
├── CodeEditor.jsx           # Code editing interface
├── ImageViewer.jsx          # Image display and viewing
├── GitPanel.jsx             # Git operations interface
├── ToolsSettings.jsx        # Application settings panel
├── TodoList.jsx             # Task management component
├── MicButton.jsx            # Voice input recording
├── DarkModeToggle.jsx       # Theme switching control
├── QuickSettingsPanel.jsx   # Quick access settings
├── LoginForm.jsx            # User authentication form
├── SetupForm.jsx            # Initial user setup form
├── ProtectedRoute.jsx       # Route protection wrapper
├── ErrorBoundary.jsx        # Error handling boundary
└── ui/                      # Reusable UI primitives
    ├── button.jsx           # Button component variants
    ├── input.jsx            # Input field components
    ├── badge.jsx            # Status and label badges
    └── scroll-area.jsx      # Custom scrollable areas
```

## Core Layout Components

### MainContent.jsx

The primary layout orchestrator that manages the main application interface.

#### Component Architecture
```javascript
const MainContent = () => {
  const [activeTab, setActiveTab] = useState('chat');
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  
  return (
    <div className="flex h-screen bg-white dark:bg-gray-900">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block">
        <Sidebar 
          selectedProject={selectedProject}
          onProjectSelect={setSelectedProject}
          selectedSession={selectedSession}
          onSessionSelect={setSelectedSession}
        />
      </div>
      
      {/* Mobile Navigation */}
      <MobileNav 
        isOpen={isMobileNavOpen}
        onClose={() => setIsMobileNavOpen(false)}
        selectedProject={selectedProject}
        onProjectSelect={setSelectedProject}
      />
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <TabNavigation 
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        
        <TabContent 
          activeTab={activeTab}
          selectedProject={selectedProject}
          selectedSession={selectedSession}
        />
      </div>
    </div>
  );
};
```

#### Responsive Design Features
- **Mobile-first layout**: Adapts to screen size automatically
- **Collapsible sidebar**: Hidden on mobile, persistent on desktop
- **Touch-friendly navigation**: Optimized touch targets for mobile
- **Keyboard navigation**: Full keyboard accessibility support

### Sidebar.jsx

The navigation sidebar containing project management and status information.

#### Key Features
```javascript
const Sidebar = ({ selectedProject, onProjectSelect, selectedSession, onSessionSelect }) => {
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedProjects, setExpandedProjects] = useState(new Set());
  
  // Real-time project updates via WebSocket
  useEffect(() => {
    const handleProjectUpdate = (data) => {
      if (data.type === 'projects_updated') {
        setProjects(data.projects);
      }
    };
    
    // WebSocket event subscription
    const unsubscribe = subscribeToProjectUpdates(handleProjectUpdate);
    return unsubscribe;
  }, []);
  
  return (
    <div className="w-64 bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
      {/* Claude Status Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <ClaudeStatus />
      </div>
      
      {/* Project List */}
      <div className="flex-1 overflow-y-auto">
        <ProjectList 
          projects={projects}
          selectedProject={selectedProject}
          onProjectSelect={onProjectSelect}
          expandedProjects={expandedProjects}
          onToggleExpanded={toggleProjectExpansion}
        />
      </div>
      
      {/* Git Panel */}
      <div className="border-t border-gray-200 dark:border-gray-700">
        <GitPanel selectedProject={selectedProject} />
      </div>
    </div>
  );
};
```

## Chat and Communication Components

### ChatInterface.jsx

The main component for Claude conversations and interactions.

#### Message Handling Architecture
```javascript
const ChatInterface = ({ selectedProject, selectedSession }) => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [usageInfo, setUsageInfo] = useState(null);
  
  // WebSocket connection for real-time communication
  const {
    socket,
    connectionState,
    sendMessage,
    connect,
    disconnect
  } = useWebSocket(`/ws?token=${authToken}`);
  
  // Handle incoming messages
  useEffect(() => {
    if (!socket) return;
    
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'claude-response':
          handleClaudeResponse(data);
          break;
        case 'usage-limit':
          setUsageInfo(data);
          break;
        case 'session-complete':
          setIsLoading(false);
          break;
        case 'error':
          handleError(data.error);
          break;
      }
    };
  }, [socket]);
  
  const sendClaudeMessage = async (message, options = {}) => {
    if (!socket || connectionState !== 'connected') {
      throw new Error('Not connected to Claude');
    }
    
    setIsLoading(true);
    
    const messageData = {
      type: 'claude-command',
      command: message,
      options: {
        projectPath: selectedProject?.fullPath,
        sessionId: selectedSession?.id,
        ...options
      }
    };
    
    sendMessage(messageData);
  };
  
  return (
    <div className="flex flex-col h-full">
      {/* Usage Limit Notification */}
      {usageInfo && <UsageLimitBanner info={usageInfo} />}
      
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <MessageBubble
            key={index}
            message={message}
            isUser={message.role === 'user'}
          />
        ))}
        
        {isLoading && <LoadingIndicator />}
      </div>
      
      {/* Input Area */}
      <MessageInput
        value={inputValue}
        onChange={setInputValue}
        onSend={sendClaudeMessage}
        disabled={isLoading}
        onImageUpload={handleImageUpload}
        onVoiceRecord={handleVoiceInput}
      />
    </div>
  );
};
```

#### Message Components
```javascript
const MessageBubble = ({ message, isUser }) => (
  <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
    <div className={`
      max-w-3xl rounded-lg px-4 py-2
      ${isUser 
        ? 'bg-blue-500 text-white' 
        : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
      }
    `}>
      {message.type === 'text' && (
        <ReactMarkdown 
          className="prose prose-sm max-w-none"
          components={{
            code: CodeBlock,
            pre: PreBlock
          }}
        >
          {message.content}
        </ReactMarkdown>
      )}
      
      {message.type === 'image' && (
        <ImageViewer src={message.content} alt="Uploaded image" />
      )}
      
      {message.type === 'file' && (
        <FileAttachment file={message.content} />
      )}
    </div>
  </div>
);

const MessageInput = ({ value, onChange, onSend, disabled, onImageUpload, onVoiceRecord }) => {
  const [isRecording, setIsRecording] = useState(false);
  const textareaRef = useRef(null);
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !disabled) {
      e.preventDefault();
      handleSend();
    }
  };
  
  const handleSend = () => {
    if (value.trim() && !disabled) {
      onSend(value.trim());
      onChange('');
    }
  };
  
  return (
    <div className="border-t border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-end gap-2">
        {/* File Upload */}
        <ImageUploadButton onUpload={onImageUpload} />
        
        {/* Voice Recording */}
        <MicButton 
          onRecord={onVoiceRecord}
          isRecording={isRecording}
          onRecordingChange={setIsRecording}
        />
        
        {/* Text Input */}
        <div className="flex-1">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Claude anything about your code..."
            disabled={disabled}
            className="w-full resize-none rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
            rows={1}
            style={{ minHeight: '40px', maxHeight: '120px' }}
          />
        </div>
        
        {/* Send Button */}
        <button
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </div>
    </div>
  );
};
```

### Shell.jsx

Terminal emulation component using XTerm.js for interactive shell sessions.

#### Terminal Architecture
```javascript
const Shell = ({ selectedProject, selectedSession, isActive }) => {
  const terminalRef = useRef(null);
  const terminal = useRef(null);
  const fitAddon = useRef(null);
  const ws = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Terminal initialization
  useEffect(() => {
    if (!terminalRef.current || !selectedProject) return;
    
    // Create new terminal instance
    terminal.current = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      allowTransparency: false,
      convertEol: true,
      scrollback: 10000,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#ffffff',
        // Extended color support
        black: '#000000',
        red: '#cd3131',
        green: '#0dbc79',
        yellow: '#e5e510',
        blue: '#2472c8',
        magenta: '#bc3fbc',
        cyan: '#11a8cd',
        white: '#e5e5e5'
      }
    });
    
    // Load addons
    fitAddon.current = new FitAddon();
    const clipboardAddon = new ClipboardAddon();
    
    terminal.current.loadAddon(fitAddon.current);
    terminal.current.loadAddon(clipboardAddon);
    
    // Open terminal in DOM
    terminal.current.open(terminalRef.current);
    
    // Fit terminal to container
    setTimeout(() => {
      if (fitAddon.current) {
        fitAddon.current.fit();
      }
    }, 50);
    
    // Handle terminal input
    terminal.current.onData((data) => {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({
          type: 'input',
          data: data
        }));
      }
    });
    
    setIsInitialized(true);
    
    return () => {
      terminal.current?.dispose();
      terminal.current = null;
      fitAddon.current = null;
    };
  }, [terminalRef.current, selectedProject]);
  
  // WebSocket connection for shell communication
  const connectToShell = async () => {
    try {
      const token = localStorage.getItem('auth-token');
      const wsUrl = `/shell?token=${encodeURIComponent(token)}`;
      
      ws.current = new WebSocket(wsUrl);
      
      ws.current.onopen = () => {
        setIsConnected(true);
        
        // Initialize shell session
        const initPayload = {
          type: 'init',
          projectPath: selectedProject.fullPath,
          sessionId: selectedSession?.id,
          hasSession: !!selectedSession
        };
        
        ws.current.send(JSON.stringify(initPayload));
      };
      
      ws.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'output') {
          terminal.current.write(data.data);
        } else if (data.type === 'url_open') {
          // Handle URL opening
          window.open(data.url, '_blank');
        }
      };
      
      ws.current.onclose = () => {
        setIsConnected(false);
        if (terminal.current) {
          terminal.current.clear();
        }
      };
      
    } catch (error) {
      console.error('Shell connection error:', error);
      setIsConnected(false);
    }
  };
  
  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Terminal Header */}
      <div className="flex-shrink-0 bg-gray-800 border-b border-gray-700 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <span className="text-sm text-gray-300">
              {selectedSession ? `Session: ${selectedSession.summary.slice(0, 30)}...` : 'New Session'}
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            {!isConnected && (
              <button
                onClick={connectToShell}
                className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
              >
                Connect
              </button>
            )}
            
            {isConnected && (
              <button
                onClick={() => ws.current?.close()}
                className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Terminal Container */}
      <div className="flex-1 p-2 overflow-hidden">
        <div 
          ref={terminalRef} 
          className="h-full w-full focus:outline-none"
          style={{ outline: 'none' }}
        />
        
        {/* Connection Overlay */}
        {!isConnected && isInitialized && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-90">
            <div className="text-center">
              <button
                onClick={connectToShell}
                className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                Start Shell Session
              </button>
              <p className="text-gray-400 text-sm mt-2">
                {selectedSession ? 
                  `Resume: ${selectedSession.summary.slice(0, 50)}...` : 
                  'Start a new Claude session'
                }
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
```

## File Management Components

### FileTree.jsx

File browser component with tree navigation and file operations.

#### Tree Structure
```javascript
const FileTree = ({ selectedProject }) => {
  const [files, setFiles] = useState([]);
  const [expandedDirs, setExpandedDirs] = useState(new Set());
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Load file tree
  useEffect(() => {
    if (!selectedProject) return;
    
    const loadFiles = async () => {
      try {
        setIsLoading(true);
        const response = await api.get(`/projects/${selectedProject.name}/files`);
        setFiles(response.data);
      } catch (error) {
        console.error('Error loading files:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadFiles();
  }, [selectedProject]);
  
  const toggleDirectory = (path) => {
    setExpandedDirs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };
  
  const renderFileNode = (file, depth = 0) => {
    const isDirectory = file.type === 'directory';
    const isExpanded = expandedDirs.has(file.path);
    const isSelected = selectedFile?.path === file.path;
    
    return (
      <div key={file.path}>
        <div
          className={`
            flex items-center px-2 py-1 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700
            ${isSelected ? 'bg-blue-100 dark:bg-blue-900' : ''}
          `}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            if (isDirectory) {
              toggleDirectory(file.path);
            } else {
              setSelectedFile(file);
            }
          }}
        >
          {/* Directory Toggle Icon */}
          {isDirectory && (
            <span className="mr-1 text-gray-400">
              {isExpanded ? '▼' : '▶'}
            </span>
          )}
          
          {/* File/Directory Icon */}
          <span className="mr-2">
            {isDirectory ? '📁' : getFileIcon(file.name)}
          </span>
          
          {/* File Name */}
          <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
            {file.name}
          </span>
          
          {/* File Size */}
          {!isDirectory && (
            <span className="ml-auto text-xs text-gray-500">
              {formatFileSize(file.size)}
            </span>
          )}
        </div>
        
        {/* Expanded Directory Contents */}
        {isDirectory && isExpanded && file.children && (
          <div>
            {file.children.map(child => renderFileNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div className="h-full flex">
      {/* File Tree */}
      <div className="w-1/3 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
        <div className="p-2">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Files
          </h3>
          
          {isLoading ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto"></div>
            </div>
          ) : (
            <div className="space-y-1">
              {files.map(file => renderFileNode(file))}
            </div>
          )}
        </div>
      </div>
      
      {/* File Content */}
      <div className="flex-1">
        {selectedFile ? (
          <CodeEditor file={selectedFile} project={selectedProject} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            Select a file to view its contents
          </div>
        )}
      </div>
    </div>
  );
};

const getFileIcon = (filename) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  const iconMap = {
    js: '📄',
    jsx: '⚛️',
    ts: '📘',
    tsx: '⚛️',
    py: '🐍',
    md: '📝',
    json: '📋',
    css: '🎨',
    html: '🌐',
    svg: '🖼️',
    png: '🖼️',
    jpg: '🖼️',
    gif: '🖼️'
  };
  return iconMap[ext] || '📄';
};
```

### CodeEditor.jsx

Code editing component with syntax highlighting and file operations.

#### Editor Implementation
```javascript
const CodeEditor = ({ file, project }) => {
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isModified, setIsModified] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const editorRef = useRef(null);
  
  // Load file content
  useEffect(() => {
    if (!file) return;
    
    const loadFileContent = async () => {
      try {
        setIsLoading(true);
        const response = await api.get(`/projects/${project.name}/file?filePath=${encodeURIComponent(file.path)}`);
        setContent(response.data.content);
        setIsModified(false);
      } catch (error) {
        console.error('Error loading file content:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadFileContent();
  }, [file, project]);
  
  // Save file content
  const saveFile = async () => {
    if (!file || !isModified) return;
    
    try {
      setIsSaving(true);
      await api.put(`/projects/${project.name}/file`, {
        filePath: file.path,
        content: content
      });
      setIsModified(false);
    } catch (error) {
      console.error('Error saving file:', error);
    } finally {
      setIsSaving(false);
    }
  };
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [saveFile]);
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  return (
    <div className="h-full flex flex-col">
      {/* Editor Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {file.name}
          </span>
          {isModified && (
            <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full">
              Modified
            </span>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={saveFile}
            disabled={!isModified || isSaving}
            className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
      
      {/* Code Editor */}
      <div className="flex-1 overflow-hidden">
        <CodeMirror
          ref={editorRef}
          value={content}
          onChange={(val) => {
            setContent(val);
            setIsModified(true);
          }}
          extensions={[
            getLanguageExtension(file.name),
            oneDark,
            EditorView.theme({
              '&': {
                height: '100%'
              },
              '.cm-scroller': {
                fontFamily: 'Menlo, Monaco, "Courier New", monospace'
              }
            })
          ]}
        />
      </div>
    </div>
  );
};

const getLanguageExtension = (filename) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  const langMap = {
    js: javascript(),
    jsx: javascript({ jsx: true }),
    ts: javascript({ typescript: true }),
    tsx: javascript({ jsx: true, typescript: true }),
    py: python(),
    md: markdown(),
    json: json(),
    css: css(),
    html: html()
  };
  return langMap[ext] || [];
};
```

## Status and Information Components

### ClaudeStatus.jsx

Component showing Claude connection status and session information.

```javascript
const ClaudeStatus = () => {
  const [status, setStatus] = useState({
    connected: false,
    activeSession: null,
    version: null
  });
  
  const { socket, connectionState } = useWebSocket('/ws');
  
  useEffect(() => {
    setStatus(prev => ({
      ...prev,
      connected: connectionState === 'connected'
    }));
  }, [connectionState]);
  
  return (
    <div className="flex items-center space-x-3">
      <div className="flex items-center space-x-2">
        <ClaudeLogo className="w-6 h-6" />
        <span className="font-semibold text-gray-700 dark:text-gray-300">
          Claude
        </span>
      </div>
      
      <div className="flex items-center space-x-1">
        <div className={`w-2 h-2 rounded-full ${
          status.connected ? 'bg-green-500' : 'bg-red-500'
        }`} />
        <span className="text-xs text-gray-500">
          {status.connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
      
      {status.activeSession && (
        <div className="text-xs text-blue-600 dark:text-blue-400">
          Session: {status.activeSession.slice(0, 8)}...
        </div>
      )}
    </div>
  );
};
```

## Input and Interaction Components

### MicButton.jsx

Voice recording component with visual feedback.

```javascript
const MicButton = ({ onRecord, isRecording, onRecordingChange }) => {
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const intervalRef = useRef(null);
  
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/wav' });
        onRecord(blob);
        stream.getTracks().forEach(track => track.stop());
      };
      
      recorder.start();
      setMediaRecorder(recorder);
      onRecordingChange(true);
      
      // Start timer
      intervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };
  
  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      setMediaRecorder(null);
      onRecordingChange(false);
      
      // Clear timer
      clearInterval(intervalRef.current);
      setRecordingTime(0);
    }
  };
  
  return (
    <button
      onClick={isRecording ? stopRecording : startRecording}
      className={`
        p-2 rounded-full transition-all duration-200
        ${isRecording 
          ? 'bg-red-500 text-white animate-pulse' 
          : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
        }
      `}
      title={isRecording ? 'Stop recording' : 'Start voice recording'}
    >
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
      </svg>
      
      {isRecording && (
        <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 text-xs bg-red-500 text-white px-2 py-1 rounded">
          {recordingTime}s
        </span>
      )}
    </button>
  );
};
```

## Reusable UI Components (ui/)

### button.jsx

Variant-based button component with consistent styling.

```javascript
const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "underline-offset-4 hover:underline text-primary"
      },
      size: {
        default: "h-10 py-2 px-4",
        sm: "h-9 px-3 rounded-md",
        lg: "h-11 px-8 rounded-md",
        icon: "h-10 w-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
});
```

### input.jsx

Styled input components with consistent design.

```javascript
const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
```

---

*These components provide a comprehensive, accessible, and performant user interface for the Claude Code UI application, with special attention to mobile usability and consistent design patterns.*