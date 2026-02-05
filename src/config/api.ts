// API Configuration for iOS 3D Scan App
export const API_CONFIG = {
  // Base URL for your API endpoint
  BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  
  // API endpoint paths
  ENDPOINTS: {
    CREATE_SCAN: '/api/scans',
    GET_LATEST_SCAN_GLB: '/api/scans/latest.glb',
    GET_SCAN_GLB: (id: string) => `/api/scans/${id}.glb`,
    GET_SCAN_PLY: (id: string) => `/api/scans/${id}.ply`,
    GET_SCAN_STATUS: (id: string) => `/api/scans/${id}/status`,
    GET_OVERLAY: (id: string) => `/api/scans/${id}/overlay`,
    GET_FLAME_BUFFERS: (id: string) => `/api/scans/${id}/flame_buffers`,
  },
  
  // Request options
  DEFAULT_HEADERS: {
    'Content-Type': 'application/json',
    // Add any authentication headers if needed
    // 'Authorization': `Bearer ${token}`,
  },
};

