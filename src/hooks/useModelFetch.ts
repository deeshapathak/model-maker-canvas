import { useState, useEffect, useCallback } from 'react';
import { fetchModelFromAPI, ModelResponse } from '@/config/api';
import { useToast } from '@/hooks/use-toast';

interface UseModelFetchOptions {
  // API endpoint URL (optional, uses default if not provided)
  endpoint?: string;
  // Auto-fetch on mount
  autoFetch?: boolean;
  // Session ID or scan ID to fetch specific model
  sessionId?: string;
  scanId?: string;
  // Custom fetch options
  fetchOptions?: RequestInit;
}

export const useModelFetch = ({
  endpoint,
  autoFetch = false,
  sessionId,
  scanId,
  fetchOptions,
}: UseModelFetchOptions = {}) => {
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelData, setModelData] = useState<ModelResponse | null>(null);
  const { toast } = useToast();

  const fetchModel = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      let apiEndpoint = endpoint;
      
      // Build endpoint based on sessionId or scanId if provided
      if (sessionId) {
        apiEndpoint = `${import.meta.env.VITE_API_URL || 'https://your-api-endpoint.com'}/api/v1/model/session/${sessionId}`;
      } else if (scanId) {
        apiEndpoint = `${import.meta.env.VITE_API_URL || 'https://your-api-endpoint.com'}/api/v1/model/${scanId}`;
      }

      const data = await fetchModelFromAPI(apiEndpoint, fetchOptions);
      
      setModelUrl(data.modelUrl);
      setModelData(data);
      
      toast({
        title: "3D Model Loaded",
        description: "Successfully fetched 3D model from API",
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch model';
      setError(errorMessage);
      
      toast({
        title: "Failed to Load Model",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [endpoint, sessionId, scanId, fetchOptions, toast]);

  // Auto-fetch on mount if enabled
  useEffect(() => {
    if (autoFetch) {
      fetchModel();
    }
  }, [autoFetch, fetchModel]);

  return {
    modelUrl,
    modelData,
    isLoading,
    error,
    fetchModel,
    reset: () => {
      setModelUrl(null);
      setModelData(null);
      setError(null);
    },
  };
};

