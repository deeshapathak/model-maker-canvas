// API Configuration for iOS 3D Scan App
export const API_CONFIG = {
  // Base URL for your API endpoint
  BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  
  // API endpoint paths
  ENDPOINTS: {
    // Get the latest 3D model from iOS scan
    GET_MODEL: '/api/v1/model/latest',
    // Get model by ID
    GET_MODEL_BY_ID: (id: string) => `/api/v1/model/${id}`,
    // Get model by scan session ID
    GET_MODEL_BY_SESSION: (sessionId: string) => `/api/v1/model/session/${sessionId}`,
    PLY_TO_GLB: '/api/ply-to-glb',
  },
  
  // Request options
  DEFAULT_HEADERS: {
    'Content-Type': 'application/json',
    // Add any authentication headers if needed
    // 'Authorization': `Bearer ${token}`,
  },
};

export interface ModelResponse {
  modelUrl: string;
  sessionId?: string;
  scanId?: string;
  createdAt?: string;
  metadata?: Record<string, any>;
}

export const fetchModelFromAPI = async (
  endpoint?: string,
  options?: RequestInit
): Promise<ModelResponse> => {
  const url = endpoint || `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_MODEL}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...API_CONFIG.DEFAULT_HEADERS,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch model: ${response.statusText}`);
  }

  const data = await response.json();
  
  // Handle different response formats
  if (data.modelUrl) {
    return data;
  } else if (data.url) {
    return { modelUrl: data.url, ...data };
  } else if (data.data?.modelUrl) {
    return data.data;
  } else {
    throw new Error('Invalid API response format');
  }
};

