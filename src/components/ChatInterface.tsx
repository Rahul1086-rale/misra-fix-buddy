import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Code, CheckCircle, Download, Merge, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';
import { getAuthenticatedUsername } from '@/lib/auth-utils';
import { v4 as uuidv4 } from 'uuid';

export default function ChatInterface() {
  const { state, dispatch } = useAppContext();
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [state.messages]);

  const openSettings = () => {
    window.open('/settings', '_blank');
  };

  const applyFixes = async (messageId: string) => {
    if (!state.projectId) return;
    try {
      const response = await apiClient.applyFixes(state.projectId);
      
      if (response.success && response.data) {
        dispatch({ type: 'SET_CURRENT_STEP', payload: 'finalize' });
        dispatch({ type: 'SET_MERGED_FILE', payload: { 
          name: `merged_${state.uploadedFile?.name || 'file.cpp'}`, 
          path: response.data.mergedFilePath 
        }});
        toast({ title: "Success", description: "Fixes applied to code successfully" });
      } else {
        throw new Error(response.error || 'Failed to apply fixes');
      }
    } catch (error) {
      toast({ 
        title: "Error", 
        description: error instanceof Error ? error.message : 'Failed to apply fixes',
        variant: "destructive" 
      });
    }
  };

  const downloadFixedFile = async () => {
    if (!state.projectId) return;
    try {
      const blob = await apiClient.downloadFixedFile(state.projectId);
      
      if (blob) {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `fixed_${state.uploadedFile?.name || 'file.cpp'}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast({ title: "Success", description: "Fixed file downloaded successfully" });
      } else {
        throw new Error('Failed to download file');
      }
    } catch (error) {
      toast({ 
        title: "Error", 
        description: error instanceof Error ? error.message : 'Failed to download file',
        variant: "destructive" 
      });
    }
  };

  const sendMessage = async () => {
    if (!message.trim() || state.isProcessing) return;

    const userMessage = {
      id: uuidv4(),
      type: 'user' as const,
      content: message,
      timestamp: new Date(),
    };

    dispatch({ type: 'ADD_MESSAGE', payload: userMessage });
    dispatch({ type: 'SET_PROCESSING', payload: true });
    setMessage('');

    try {
      if (!state.projectId) {
        throw new Error('No project ID available');
      }

      const response = await apiClient.sendChatMessage(message, state.projectId, getAuthenticatedUsername());

      if (response.success && response.data) {
        const assistantMessage = {
          id: uuidv4(),
          type: 'assistant' as const,
          content: response.data.response,
          timestamp: new Date(),
        };

        dispatch({ type: 'ADD_MESSAGE', payload: assistantMessage });
      } else {
        throw new Error(response.error || 'Chat request failed');
      }
    } catch (error) {
      console.error('Chat error:', error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    } finally {
      dispatch({ type: 'SET_PROCESSING', payload: false });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <Card className="flex flex-col h-full relative">
      {/* Settings Button - Top Right */}
      {/* <div className="absolute top-4 right-4 z-10">
        <Button
          //onClick={openSettings}
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          title="Open Settings"
        >
          <Settings className="w-4 h-4" />
        </Button>
      </div> */}

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pt-12">
        {state.messages.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Welcome to RT MISRA Copilot!</p>
            <p className="text-sm">Upload your files and start the workflow to begin.</p>
          </div>
        )}
        
        {state.messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${
              msg.type === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {msg.type === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-primary-foreground" />
              </div>
            )}
            
            <div
              className={`max-w-[70%] rounded-lg p-3 ${
                msg.type === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted'
              }`}
            >
              <div className="whitespace-pre-wrap text-sm">
                {msg.content}
              </div>
              
              {/* Code snippets display */}
              {(msg as any).codeSnippets && (msg as any).codeSnippets.length > 0 && (
                <div className="mt-3 space-y-2">
                  {(msg as any).codeSnippets.map((snippet: string, index: number) => (
                    <div key={index} className="bg-background rounded border p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Code className="w-4 h-4" />
                        <span className="text-xs font-medium">Code Fix {index + 1}</span>
                      </div>
                      <pre className="text-xs overflow-x-auto">
                        <code>{snippet}</code>
                      </pre>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Action buttons for assistant messages (starting from 2nd message) */}
              {msg.type === 'assistant' && state.messages.length >= 2 && (
                <div className="mt-4 flex gap-2">
                  <Button
                    onClick={() => applyFixes(msg.id)}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                  >
                    <Merge className="w-3 h-3 mr-1" />
                    Merge Fixes
                  </Button>
                  <Button
                    onClick={downloadFixedFile}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                  >
                    <Download className="w-3 h-3 mr-1" />
                    Download
                  </Button>
                </div>
              )}
            </div>
            
            {msg.type === 'user' && (
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}
        
        {state.isProcessing && (
          <div className="flex gap-3 justify-start">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <Bot className="w-4 h-4 text-primary-foreground animate-pulse" />
            </div>
            <div className="bg-muted rounded-lg p-3 max-w-[70%]">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t p-4">
        <div className="flex gap-2">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about MISRA violations or request code fixes..."
            className="flex-1 min-h-[60px] max-h-[120px]"
            disabled={state.isProcessing}
          />
          <Button
            onClick={sendMessage}
            disabled={!message.trim() || state.isProcessing}
            size="lg"
            className="px-4"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        
        {/* Workflow Status */}
        <div className="mt-3 text-xs text-muted-foreground">
          Current Step: <span className="font-medium capitalize">{state.currentStep}</span>
          {state.projectId && (
            <span className="ml-3">
              Project: <span className="font-mono">{state.projectId.slice(0, 8)}...</span>
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}