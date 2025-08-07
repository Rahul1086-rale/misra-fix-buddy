
import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { concurrentApiClient } from '@/lib/concurrent-api';

export interface ModelSettings {
  temperature: number;
  top_p: number;
  max_tokens: number;
  model_name: string;
  safety_settings: boolean;
}

export interface Violation {
  file: string;
  path: string;
  line: number;
  warning: string;
  level: string;
  misra: string;
  selected?: boolean;
}

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface FixedSnippet {
  lineNumber: string;
  code: string;
  applied?: boolean;
}

export interface RequestStatus {
  id: string;
  projectId: string;
  type: 'upload' | 'fix-violations' | 'chat' | 'apply-fixes';
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress?: number;
  error?: string;
}

export interface AppState {
  // File management
  uploadedFile: { name: string; path: string } | null;
  excelFile: { name: string; path: string } | null;
  numberedFile: { name: string; path: string } | null;
  mergedFile: { name: string; path: string } | null;
  
  // Violations
  violations: Violation[];
  selectedViolations: Violation[];
  
  // Chat state
  messages: ChatMessage[];
  isProcessing: boolean;
  
  // Workflow state
  currentStep: 'upload' | 'violations' | 'numbering' | 'chat' | 'fixing' | 'finalize';
  isLoading: boolean;
  
  // Project state
  projectId: string | null;
  
  // Concurrent processing state
  activeRequests: RequestStatus[];
  queueStatus: { queued: number; active: number; maxConcurrent: number };
  
  // Legacy support
  currentVersion: number;
  chatHistory: ChatMessage[];
  fixedSnippets: FixedSnippet[];
  modelSettings: ModelSettings;
  sessionId: string | null;
}

type AppAction =
  | { type: 'SET_UPLOADED_FILE'; payload: { name: string; path: string } }
  | { type: 'SET_EXCEL_FILE'; payload: { name: string; path: string } }
  | { type: 'SET_NUMBERED_FILE'; payload: { name: string; path: string } }
  | { type: 'SET_MERGED_FILE'; payload: { name: string; path: string } }
  | { type: 'SET_VIOLATIONS'; payload: Violation[] }
  | { type: 'TOGGLE_VIOLATION'; payload: string }
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'SET_CURRENT_STEP'; payload: AppState['currentStep'] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_PROCESSING'; payload: boolean }
  | { type: 'SET_PROJECT_ID'; payload: string }
  | { type: 'RESET_STATE' }
  | { type: 'SET_SELECTED_VIOLATIONS'; payload: Violation[] }
  | { type: 'ADD_CHAT_MESSAGE'; payload: ChatMessage }
  | { type: 'SET_FIXED_SNIPPETS'; payload: FixedSnippet[] }
  | { type: 'UPDATE_MODEL_SETTINGS'; payload: Partial<ModelSettings> }
  | { type: 'SET_SESSION_ID'; payload: string }
  | { type: 'INCREMENT_VERSION' }
  | { type: 'LOAD_SESSION_STATE'; payload: Partial<AppState> }
  | { type: 'ADD_REQUEST'; payload: RequestStatus }
  | { type: 'UPDATE_REQUEST'; payload: { id: string; updates: Partial<RequestStatus> } }
  | { type: 'REMOVE_REQUEST'; payload: string }
  | { type: 'UPDATE_QUEUE_STATUS'; payload: { queued: number; active: number; maxConcurrent: number } };

const initialState: AppState = {
  uploadedFile: null,
  excelFile: null,
  numberedFile: null,
  mergedFile: null,
  violations: [],
  selectedViolations: [],
  messages: [],
  isProcessing: false,
  currentStep: 'upload',
  isLoading: false,
  projectId: null,
  activeRequests: [],
  queueStatus: { queued: 0, active: 0, maxConcurrent: 5 },
  currentVersion: 0,
  chatHistory: [],
  fixedSnippets: [],
  modelSettings: {
    temperature: 0.5,
    top_p: 0.95,
    max_tokens: 65535,
    model_name: 'gemini-1.5-flash',
    safety_settings: false,
  },
  sessionId: null,
};

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_UPLOADED_FILE':
      return { ...state, uploadedFile: action.payload };
    case 'SET_EXCEL_FILE':
      return { ...state, excelFile: action.payload };
    case 'SET_NUMBERED_FILE':
      return { ...state, numberedFile: action.payload };
    case 'SET_MERGED_FILE':
      return { ...state, mergedFile: action.payload };
    case 'SET_VIOLATIONS':
      return { 
        ...state, 
        violations: action.payload,
        currentStep: 'violations'
      };
    case 'TOGGLE_VIOLATION':
      const updatedViolations = state.violations.map(v =>
        v.line.toString() === action.payload ? { ...v, selected: !v.selected } : v
      );
      return {
        ...state,
        violations: updatedViolations,
        selectedViolations: updatedViolations.filter(v => v.selected)
      };
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload] };
    case 'SET_CURRENT_STEP':
      return { ...state, currentStep: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_PROCESSING':
      return { ...state, isProcessing: action.payload };
    case 'SET_PROJECT_ID':
      return { ...state, projectId: action.payload };
    case 'RESET_STATE':
      return initialState;
    
    // Concurrent processing actions
    case 'ADD_REQUEST':
      return { 
        ...state, 
        activeRequests: [...state.activeRequests, action.payload] 
      };
    case 'UPDATE_REQUEST':
      return {
        ...state,
        activeRequests: state.activeRequests.map(req =>
          req.id === action.payload.id 
            ? { ...req, ...action.payload.updates }
            : req
        )
      };
    case 'REMOVE_REQUEST':
      return {
        ...state,
        activeRequests: state.activeRequests.filter(req => req.id !== action.payload)
      };
    case 'UPDATE_QUEUE_STATUS':
      return { ...state, queueStatus: action.payload };
    
    // Legacy support
    case 'SET_SELECTED_VIOLATIONS':
      return { ...state, selectedViolations: action.payload };
    case 'ADD_CHAT_MESSAGE':
      return { 
        ...state, 
        chatHistory: [...state.chatHistory, action.payload]
      };
    case 'SET_FIXED_SNIPPETS':
      return { ...state, fixedSnippets: action.payload };
    case 'UPDATE_MODEL_SETTINGS':
      return { 
        ...state, 
        modelSettings: { ...state.modelSettings, ...action.payload }
      };
    case 'SET_SESSION_ID':
      return { ...state, sessionId: action.payload };
    case 'INCREMENT_VERSION':
      return { ...state, currentVersion: state.currentVersion + 1 };
    case 'LOAD_SESSION_STATE':
      return { ...state, ...action.payload };
    
    default:
      return state;
  }
}

interface ConcurrentAppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  // Helper functions
  addChatMessage: (content: string, type: 'user' | 'assistant' | 'system') => void;
  toggleViolation: (violation: Violation) => void;
  loadSessionState: () => Promise<void>;
  saveSessionState: () => Promise<void>;
  // Concurrent processing helpers
  startRequest: (requestType: RequestStatus['type'], projectId: string) => string;
  updateRequest: (id: string, updates: Partial<RequestStatus>) => void;
  completeRequest: (id: string) => void;
  errorRequest: (id: string, error: string) => void;
  updateQueueStatus: () => void;
}

const ConcurrentAppContext = createContext<ConcurrentAppContextType | undefined>(undefined);

export function ConcurrentAppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const { toast } = useToast();

  const addChatMessage = useCallback((content: string, type: 'user' | 'assistant' | 'system') => {
    const message: ChatMessage = {
      id: Date.now().toString(),
      type,
      content,
      timestamp: new Date(),
    };
    dispatch({ type: 'ADD_CHAT_MESSAGE', payload: message });
  }, []);

  const toggleViolation = useCallback((violation: Violation) => {
    const key = `${violation.file}-${violation.line}-${violation.misra}`;
    dispatch({ type: 'TOGGLE_VIOLATION', payload: key });
  }, []);

  const loadSessionState = useCallback(async () => {
    try {
      const response = await fetch('/api/session-state');
      if (response.ok) {
        const sessionState = await response.json();
        dispatch({ type: 'LOAD_SESSION_STATE', payload: sessionState });
      }
    } catch (error) {
      console.error('Failed to load session state:', error);
    }
  }, []);

  const saveSessionState = useCallback(async () => {
    try {
      await fetch('/api/session-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
    } catch (error) {
      console.error('Failed to save session state:', error);
      toast({
        title: "Error",
        description: "Failed to save session state",
        variant: "destructive",
      });
    }
  }, [state, toast]);

  const startRequest = useCallback((requestType: RequestStatus['type'], projectId: string): string => {
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const request: RequestStatus = {
      id: requestId,
      projectId,
      type: requestType,
      status: 'pending',
      progress: 0,
    };
    
    dispatch({ type: 'ADD_REQUEST', payload: request });
    return requestId;
  }, []);

  const updateRequest = useCallback((id: string, updates: Partial<RequestStatus>) => {
    dispatch({ type: 'UPDATE_REQUEST', payload: { id, updates } });
  }, []);

  const completeRequest = useCallback((id: string) => {
    dispatch({ type: 'UPDATE_REQUEST', payload: { id, updates: { status: 'completed' } } });
    setTimeout(() => {
      dispatch({ type: 'REMOVE_REQUEST', payload: id });
    }, 5000); // Remove completed requests after 5 seconds
  }, []);

  const errorRequest = useCallback((id: string, error: string) => {
    dispatch({ type: 'UPDATE_REQUEST', payload: { id, updates: { status: 'error', error } } });
  }, []);

  const updateQueueStatus = useCallback(() => {
    const status = concurrentApiClient.getQueueStatus();
    dispatch({ type: 'UPDATE_QUEUE_STATUS', payload: status });
  }, []);

  // Update queue status periodically
  useEffect(() => {
    const interval = setInterval(updateQueueStatus, 1000);
    return () => clearInterval(interval);
  }, [updateQueueStatus]);

  // Load session state on mount
  useEffect(() => {
    loadSessionState();
  }, [loadSessionState]);

  // Save session state when it changes
  useEffect(() => {
    if (state.projectId) {
      saveSessionState();
    }
  }, [state, saveSessionState]);

  const contextValue: ConcurrentAppContextType = {
    state,
    dispatch,
    addChatMessage,
    toggleViolation,
    loadSessionState,
    saveSessionState,
    startRequest,
    updateRequest,
    completeRequest,
    errorRequest,
    updateQueueStatus,
  };

  return (
    <ConcurrentAppContext.Provider value={contextValue}>
      {children}
    </ConcurrentAppContext.Provider>
  );
}

export function useConcurrentAppContext() {
  const context = useContext(ConcurrentAppContext);
  if (context === undefined) {
    throw new Error('useConcurrentAppContext must be used within a ConcurrentAppProvider');
  }
  return context;
}
