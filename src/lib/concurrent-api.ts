
// Concurrent API client with request queuing and parallel processing

interface QueuedRequest {
  id: string;
  endpoint: string;
  options: RequestInit;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  priority: number;
}

class ConcurrentApiClient {
  private baseUrl: string;
  private requestQueue: QueuedRequest[] = [];
  private activeRequests: Map<string, AbortController> = new Map();
  private maxConcurrentRequests: number = 5;
  private currentRequests: number = 0;

  constructor() {
    this.baseUrl = '/api';
  }

  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async processQueue(): Promise<void> {
    while (this.requestQueue.length > 0 && this.currentRequests < this.maxConcurrentRequests) {
      const queuedRequest = this.requestQueue.shift();
      if (!queuedRequest) continue;

      this.currentRequests++;
      this.executeRequest(queuedRequest);
    }
  }

  private async executeRequest(queuedRequest: QueuedRequest): Promise<void> {
    const { id, endpoint, options, resolve, reject } = queuedRequest;
    
    try {
      const controller = new AbortController();
      this.activeRequests.set(id, controller);

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      this.activeRequests.delete(id);
      this.currentRequests--;

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      resolve({ success: true, data });

      // Process next request in queue
      this.processQueue();
    } catch (error) {
      this.activeRequests.delete(id);
      this.currentRequests--;
      
      if (error instanceof Error && error.name !== 'AbortError') {
        reject({
          success: false,
          error: error.message,
        });
      }

      // Process next request in queue even if this one failed
      this.processQueue();
    }
  }

  private async queueRequest<T>(
    endpoint: string,
    options: RequestInit = {},
    priority: number = 1
  ): Promise<{ success: boolean; data?: T; error?: string }> {
    return new Promise((resolve, reject) => {
      const requestId = this.generateRequestId();
      
      const queuedRequest: QueuedRequest = {
        id: requestId,
        endpoint,
        options,
        resolve,
        reject,
        priority,
      };

      // Insert request based on priority (higher priority first)
      let inserted = false;
      for (let i = 0; i < this.requestQueue.length; i++) {
        if (this.requestQueue[i].priority < priority) {
          this.requestQueue.splice(i, 0, queuedRequest);
          inserted = true;
          break;
        }
      }
      
      if (!inserted) {
        this.requestQueue.push(queuedRequest);
      }

      // Process queue immediately
      this.processQueue();
    });
  }

  // High priority methods for critical operations
  async uploadCppFile(file: File, projectId: string, priority: number = 3) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('projectId', projectId);

    return this.queueRequest('/upload/cpp-file', {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set Content-Type for FormData
    }, priority);
  }

  async uploadMisraReport(file: File, projectId: string, targetFile: string, priority: number = 3) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('projectId', projectId);
    formData.append('targetFile', targetFile);

    return this.queueRequest('/upload/misra-report', {
      method: 'POST',
      body: formData,
      headers: {},
    }, priority);
  }

  async addLineNumbers(projectId: string, priority: number = 2) {
    return this.queueRequest('/process/add-line-numbers', {
      method: 'POST',
      body: JSON.stringify({ projectId }),
    }, priority);
  }

  async sendFirstPrompt(projectId: string, priority: number = 2) {
    return this.queueRequest('/gemini/first-prompt', {
      method: 'POST',
      body: JSON.stringify({ projectId }),
    }, priority);
  }

  async fixViolations(projectId: string, violations: any[], priority: number = 1) {
    console.log(`Queuing violation fix request for project ${projectId}`);
    return this.queueRequest('/gemini/fix-violations', {
      method: 'POST',
      body: JSON.stringify({ projectId, violations }),
    }, priority);
  }

  async sendChatMessage(message: string, projectId: string, priority: number = 1) {
    return this.queueRequest('/chat', {
      method: 'POST',
      body: JSON.stringify({ message, projectId }),
    }, priority);
  }

  async applyFixes(projectId: string, priority: number = 2) {
    return this.queueRequest('/process/apply-fixes', {
      method: 'POST',
      body: JSON.stringify({ projectId }),
    }, priority);
  }

  async applyAcceptedFixes(projectId: string, priority: number = 2) {
    return this.queueRequest('/process/apply-accepted-fixes', {
      method: 'POST',
      body: JSON.stringify({ projectId }),
    }, priority);
  }

  // Utility methods
  async cancelRequest(requestId: string): Promise<boolean> {
    const controller = this.activeRequests.get(requestId);
    if (controller) {
      controller.abort();
      this.activeRequests.delete(requestId);
      return true;
    }
    return false;
  }

  async cancelAllRequests(): Promise<void> {
    this.activeRequests.forEach(controller => controller.abort());
    this.activeRequests.clear();
    this.requestQueue.length = 0;
    this.currentRequests = 0;
  }

  getQueueStatus(): { queued: number; active: number; maxConcurrent: number } {
    return {
      queued: this.requestQueue.length,
      active: this.currentRequests,
      maxConcurrent: this.maxConcurrentRequests,
    };
  }

  // Download method (bypass queue for direct downloads)
  async downloadFixedFile(projectId: string): Promise<Blob | null> {
    try {
      const response = await fetch(`${this.baseUrl}/download/fixed-file?projectId=${projectId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.blob();
    } catch (error) {
      console.error('Download failed:', error);
      return null;
    }
  }

  // File content methods (bypass queue for file reading)
  async getNumberedFile(projectId: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/files/numbered/${projectId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      console.error('Failed to get numbered file:', error);
      return null;
    }
  }

  async getTempFixedFile(projectId: string): Promise<string | null> {
    try {
      const response = await fetch(`${this.baseUrl}/files/temp-fixed/${projectId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.text();
    } catch (error) {
      console.error('Failed to get temp fixed file:', error);
      return null;
    }
  }

  async getDiff(projectId: string, priority: number = 1) {
    return this.queueRequest(`/diff/${projectId}`, {
      method: 'GET',
    }, priority);
  }

  async getReviewState(projectId: string, priority: number = 1) {
    return this.queueRequest(`/review/state/${projectId}`, {
      method: 'GET',
    }, priority);
  }

  async reviewAction(projectId: string, line_key: string, action: 'accept' | 'reject' | 'reset', priority: number = 1) {
    return this.queueRequest('/review/action', {
      method: 'POST',
      body: JSON.stringify({ projectId, line_key, action }),
    }, priority);
  }

  async navigateReview(projectId: string, index: number, priority: number = 1) {
    return this.queueRequest('/review/navigate', {
      method: 'POST',
      body: JSON.stringify({ projectId, index }),
    }, priority);
  }

  async resetReview(projectId: string, priority: number = 1) {
    return this.queueRequest(`/review/reset/${projectId}`, {
      method: 'POST',
    }, priority);
  }

  async getCodeSnippets(projectId: string, priority: number = 1) {
    return this.queueRequest(`/code-snippets/${projectId}`, {
      method: 'GET',
    }, priority);
  }

  async getViolationMapping(projectId: string, priority: number = 1) {
    return this.queueRequest(`/violation-mapping/${projectId}`, {
      method: 'GET',
    }, priority);
  }
}

export const concurrentApiClient = new ConcurrentApiClient();
