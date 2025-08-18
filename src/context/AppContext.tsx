import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

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
  | { type: 'LOAD_SESSION_STATE'; payload: Partial<AppState> };

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

interface AppContextType {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  // Helper functions
  addChatMessage: (content: string, type: 'user' | 'assistant' | 'system') => void;
  toggleViolation: (violation: Violation) => void;
  loadSessionState: () => Promise<void>;
  saveSessionState: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const { toast } = useToast();

  const addChatMessage = (content: string, type: 'user' | 'assistant' | 'system') => {
    const message: ChatMessage = {
      id: Date.now().toString(),
      type,
      content,
      timestamp: new Date(),
    };
    dispatch({ type: 'ADD_CHAT_MESSAGE', payload: message });
  };

  const toggleViolation = (violation: Violation) => {
    const key = `${violation.file}-${violation.line}-${violation.misra}`;
    dispatch({ type: 'TOGGLE_VIOLATION', payload: key });
  };

  const loadSessionState = async () => {
    try {
      const response = await fetch('/api/session-state');
      if (response.ok) {
        const sessionState = await response.json();
        dispatch({ type: 'LOAD_SESSION_STATE', payload: sessionState });
      }
    } catch (error) {
      console.error('Failed to load session state:', error);
    }
  };

  const saveSessionState = async () => {
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
  };

  // Load session state on mount
  useEffect(() => {
    loadSessionState();
  }, []);

  // Save session state when it changes
  useEffect(() => {
    if (state.projectId) {
      saveSessionState();
    }
  }, [state]);

  const contextValue: AppContextType = {
    state,
    dispatch,
    addChatMessage,
    toggleViolation,
    loadSessionState,
    saveSessionState,
  };

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}