// API utility functions for MISRA Fix Copilot

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface UploadResponse {
  filePath: string;
  fileName: string;
}

export interface ViolationResponse {
  file: string;
  path: string;
  line: number;
  warning: string;
  level: string;
  misra: string;
}

export interface GeminiResponse {
  response: string;
  codeSnippets?: string[];
}

export interface ReviewData {
  pending_changes: string[];
  accepted_changes: string[];
  rejected_changes: string[];
  current_line: string | null;
  total_changes: number;
  reviewed_count: number;
}

export interface AcceptRejectResponse {
  success: boolean;
  message: string;
  next_line: string | null;
  review_data: ReviewData;
}

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = '/api';
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      console.error('API request failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // File upload endpoints
  async uploadCppFile(file: File, projectId: string): Promise<ApiResponse<UploadResponse>> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('projectId', projectId);

    return this.request('/upload/cpp-file', {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set Content-Type for FormData
    });
  }

  async uploadMisraReport(
    file: File,
    projectId: string,
    targetFile: string
  ): Promise<ApiResponse<ViolationResponse[]>> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('projectId', projectId);
    formData.append('targetFile', targetFile);

    return this.request('/upload/misra-report', {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set Content-Type for FormData
    });
  }

  // Processing endpoints
  async addLineNumbers(projectId: string): Promise<ApiResponse<{ numberedFilePath: string }>> {
    return this.request('/process/add-line-numbers', {
      method: 'POST',
      body: JSON.stringify({ projectId }),
    });
  }

  async applyFixes(projectId: string): Promise<ApiResponse<{ mergedFilePath: string }>> {
    return this.request('/process/apply-fixes', {
      method: 'POST',
      body: JSON.stringify({ projectId }),
    });
  }

  // Gemini AI endpoints
  async sendFirstPrompt(projectId: string): Promise<ApiResponse<GeminiResponse>> {
    return this.request('/gemini/first-prompt', {
      method: 'POST',
      body: JSON.stringify({ projectId, use_merged_file: true }),
    });
  }

  async fixViolations(projectId: string, violations: ViolationResponse[]): Promise<ApiResponse<GeminiResponse>> {
    return this.request('/gemini/fix-violations', {
      method: 'POST',
      body: JSON.stringify({ projectId, violations }),
    });
  }

  async sendChatMessage(
    message: string,
    projectId: string
  ): Promise<ApiResponse<{ response: string }>> {
    return this.request('/chat', {
      method: 'POST',
      body: JSON.stringify({ message, projectId, use_merged_file: true }),
    });
  }

  // Download endpoints
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

  // File content endpoints for Fix View Modal
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

  // Updated diff endpoint with review data
  async getDiff(projectId: string, onlyAccepted: boolean = false): Promise<ApiResponse<{
    original: string, 
    fixed: string, 
    has_changes: boolean, 
    highlight: {
      line_mappings: Record<number, number>;
      changed_lines: number[];
      changed_lines_fixed: number[];
      added_lines: number[];
      removed_lines: number[];
    };
    review_data: ReviewData;
    session_id: string;
  }>> {
    const params = onlyAccepted ? '?only_accepted=true' : '';
    return this.request(`/diff/${projectId}${params}`, {
      method: 'GET',
    });
  }

  // Accept/Reject change endpoints
  async acceptChange(projectId: string, lineKey: string): Promise<ApiResponse<AcceptRejectResponse>> {
    return this.request('/review/accept-reject', {
      method: 'POST',
      body: JSON.stringify({ 
        projectId, 
        lineKey, 
        action: 'accept' 
      }),
    });
  }

  async rejectChange(projectId: string, lineKey: string): Promise<ApiResponse<AcceptRejectResponse>> {
    return this.request('/review/accept-reject', {
      method: 'POST',
      body: JSON.stringify({ 
        projectId, 
        lineKey, 
        action: 'reject' 
      }),
    });
  }

  // Navigation endpoints
  async navigateToNext(projectId: string, currentLine?: string): Promise<ApiResponse<AcceptRejectResponse>> {
    return this.request('/review/navigate', {
      method: 'POST',
      body: JSON.stringify({ 
        projectId, 
        direction: 'next',
        currentLine 
      }),
    });
  }

  async navigateToPrev(projectId: string, currentLine?: string): Promise<ApiResponse<AcceptRejectResponse>> {
    return this.request('/review/navigate', {
      method: 'POST',
      body: JSON.stringify({ 
        projectId, 
        direction: 'prev',
        currentLine 
      }),
    });
  }

  // Apply only accepted fixes
  async applyAcceptedFixes(projectId: string): Promise<ApiResponse<{ fixedFilePath: string }>> {
    return this.request('/process/apply-accepted-fixes', {
      method: 'POST',
      body: JSON.stringify({ projectId }),
    });
  }
}

export const apiClient = new ApiClient();
