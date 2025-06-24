// Backend configuration
export const BACKEND_CONFIG = {
  // Local development
  LOCAL: 'http://localhost:3001',
  
  // Cloudflare Workers (replace with your actual worker URL)
  CLOUDFLARE: 'https://3d-scanner-backend.pathakdeesha.workers.dev',
  
  // Current backend to use
  CURRENT: 'https://3d-scanner-backend.pathakdeesha.workers.dev'
};

export const getBackendUrl = () => {
  return BACKEND_CONFIG.CURRENT;
};

export const getApiUrl = (endpoint: string) => {
  return `${getBackendUrl()}${endpoint}`;
};
