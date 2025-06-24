import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

interface ScanStatus {
  status: 'processing' | 'completed' | 'error';
  glbUrl?: string;
  completedAt?: string;
  message?: string;
}

interface UsePatientScanOptions {
  token: string;
  pollInterval?: number; // milliseconds
  autoStart?: boolean;
}

export const usePatientScan = ({ 
  token, 
  pollInterval = 5000, 
  autoStart = true 
}: UsePatientScanOptions) => {
  const [scanStatus, setScanStatus] = useState<ScanStatus>({ status: 'processing' });
  const [isPolling, setIsPolling] = useState(autoStart);
  const [error, setError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const checkScanStatus = useCallback(async () => {
    if (!token) return;

    try {
      setIsLoading(true);
      const response = await fetch(`/api/check-scan?token=${token}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.status === 'completed' && data.glbUrl) {
        setScanStatus({
          status: 'completed',
          glbUrl: data.glbUrl,
          completedAt: data.completedAt
        });
        setIsPolling(false);
        
        toast({
          title: "3D Model Ready!",
          description: "Patient's face scan has been completed and is ready for viewing.",
        });
      } else {
        setScanStatus({
          status: 'processing',
          message: data.message || 'Scan is being processed...'
        });
      }
      
      setError('');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to check scan status';
      setError(errorMessage);
      console.error('Scan status check failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, toast]);

  const startPolling = useCallback(() => {
    setIsPolling(true);
    setError('');
  }, []);

  const stopPolling = useCallback(() => {
    setIsPolling(false);
  }, []);

  const resetScan = useCallback(() => {
    setScanStatus({ status: 'processing' });
    setError('');
    setIsPolling(true);
  }, []);

  // Initial check
  useEffect(() => {
    if (autoStart && token) {
      checkScanStatus();
    }
  }, [token, autoStart, checkScanStatus]);

  // Polling effect
  useEffect(() => {
    if (!isPolling || !token) return;

    const interval = setInterval(() => {
      checkScanStatus();
    }, pollInterval);

    return () => clearInterval(interval);
  }, [isPolling, token, pollInterval, checkScanStatus]);

  return {
    scanStatus,
    isPolling,
    isLoading,
    error,
    checkScanStatus,
    startPolling,
    stopPolling,
    resetScan
  };
};
