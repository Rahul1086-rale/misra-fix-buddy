import React, { useState } from 'react';
import { MessageSquare, Send, Bot, User, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { apiClient } from '@/lib/api';
import { v4 as uuidv4 } from 'uuid';

interface ChatFeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ChatFeedbackModal({ isOpen, onClose }: ChatFeedbackModalProps) {
  const { state, dispatch } = useAppContext();
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const [localMessages, setLocalMessages] = useState(state.messages);
  const [isProcessing, setIsProcessing] = useState(false);

  const sendMessage = async () => {
    if (!message.trim() || isProcessing || !state.projectId) return;

    const userMessage = {
      id: uuidv4(),
      type: 'user' as const,
      content: message,
      timestamp: new Date(),
    };

    setLocalMessages(prev => [...prev, userMessage]);
    dispatch({ type: 'ADD_MESSAGE', payload: userMessage });
    setIsProcessing(true);
    setMessage('');

    try {
      const response = await apiClient.sendChatMessage(message, state.projectId);

      if (response.success && response.data) {
        const assistantMessage = {
          id: uuidv4(),
          type: 'assistant' as const,
          content: response.data.response,
          timestamp: new Date(),
        };

        setLocalMessages(prev => [...prev, assistantMessage]);
        dispatch({ type: 'ADD_MESSAGE', payload: assistantMessage });
        
        toast({
          title: "Response received",
          description: "The AI has updated the fix based on your feedback",
        });
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
      setIsProcessing(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Chat & Feedback
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col h-[500px]">
          {/* Chat Messages */}
          <ScrollArea className="flex-1 p-4 border rounded-lg mb-4">
            <div className="space-y-4">
              {localMessages.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  <Bot className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No messages yet. Start a conversation with the AI!</p>
                  <p className="text-sm mt-1">Ask questions about the fixes or request modifications.</p>
                </div>
              )}
              
              {localMessages.map((msg) => (
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
                    <div className="text-xs opacity-70 mt-1">
                      {msg.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                  
                  {msg.type === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              ))}
              
              {isProcessing && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                    <Bot className="w-4 h-4 text-primary-foreground animate-pulse" />
                  </div>
                  <div className="bg-muted rounded-lg p-3">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="space-y-3">
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask about the fixes, request modifications, or provide feedback..."
              className="min-h-[80px]"
              disabled={isProcessing}
            />
            
            <div className="flex justify-between items-center">
              <div className="text-xs text-muted-foreground">
                Press Enter to send, Shift+Enter for new line
              </div>
              
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>
                  Close
                </Button>
                <Button
                  onClick={sendMessage}
                  disabled={!message.trim() || isProcessing}
                >
                  <Send className="w-4 h-4 mr-2" />
                  {isProcessing ? 'Sending...' : 'Send'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}