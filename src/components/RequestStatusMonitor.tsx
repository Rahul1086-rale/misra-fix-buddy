
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { X, Clock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useConcurrentAppContext } from '@/context/ConcurrentAppContext';
import { concurrentApiClient } from '@/lib/concurrent-api';

export default function RequestStatusMonitor() {
  const { state, dispatch } = useConcurrentAppContext();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-500';
      case 'processing':
        return 'bg-blue-500';
      case 'completed':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const cancelRequest = async (requestId: string) => {
    await concurrentApiClient.cancelRequest(requestId);
    dispatch({ type: 'REMOVE_REQUEST', payload: requestId });
  };

  const clearRequest = (requestId: string) => {
    dispatch({ type: 'REMOVE_REQUEST', payload: requestId });
  };

  if (state.activeRequests.length === 0 && state.queueStatus.queued === 0 && state.queueStatus.active === 0) {
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          Request Status Monitor
          <Badge variant="outline" className="text-xs">
            Queue: {state.queueStatus.queued} | Active: {state.queueStatus.active}/{state.queueStatus.maxConcurrent}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {state.activeRequests.map((request) => (
          <div key={request.id} className="flex items-center space-x-3 p-3 border rounded-lg">
            <div className="flex-shrink-0">
              {getStatusIcon(request.status)}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {request.type.charAt(0).toUpperCase() + request.type.slice(1).replace('-', ' ')}
                </p>
                <Badge variant="outline" className={`text-xs ${getStatusColor(request.status)}`}>
                  {request.status}
                </Badge>
              </div>
              
              <p className="text-xs text-gray-500 truncate">
                Project: {request.projectId}
              </p>
              
              {request.progress !== undefined && request.status === 'processing' && (
                <Progress value={request.progress} className="w-full h-2 mt-2" />
              )}
              
              {request.error && (
                <p className="text-xs text-red-600 mt-1">
                  Error: {request.error}
                </p>
              )}
            </div>
            
            <div className="flex-shrink-0">
              {request.status === 'pending' || request.status === 'processing' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => cancelRequest(request.id)}
                  className="h-8 w-8 p-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => clearRequest(request.id)}
                  className="h-8 w-8 p-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
        
        {(state.queueStatus.queued > 0 || state.queueStatus.active > 0) && (
          <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center space-x-2">
              <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
              <span className="text-sm text-blue-700">
                Processing requests concurrently...
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => concurrentApiClient.cancelAllRequests()}
              className="text-xs"
            >
              Cancel All
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
