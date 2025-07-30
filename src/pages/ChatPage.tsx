import React from 'react';
import { AppProvider } from '@/context/AppContext';
import NewWorkflowPanel from '@/components/NewWorkflowPanel';
import rtMisraLogo from '@/assets/rt-misra-logo.png';

export default function ChatPage() {
  return (
    <AppProvider>
      <div className="min-h-screen bg-background">
        {/* Top-left logo */}
        <div className="absolute top-6 left-6 z-50">
          <img src={rtMisraLogo} alt="RT MISRA Copilot" className="h-12" />
        </div>
        
        <div className="container mx-auto p-6">
          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <br />
            <div className="mb-8 text-center">
              <h1 className="text-3xl font-bold mb-4">RT MISRA Copilot</h1>
              <p className="text-muted-foreground">
                Upload your Source files and MISRA reports to automatically fix violations
              </p>
            </div>

            {/* Main Workflow Panel */}
            <NewWorkflowPanel />
          </div>
        </div>
      </div>
    </AppProvider>
  );
}