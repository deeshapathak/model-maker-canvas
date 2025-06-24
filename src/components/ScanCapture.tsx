import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  QrCode, 
  Smartphone, 
  Camera, 
  Upload, 
  CheckCircle, 
  AlertCircle, 
  RefreshCw,
  Eye,
  Download,
  Copy,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ScanSession {
  sessionId: string;
  patientName: string;
  status: 'waiting' | 'capturing' | 'processing' | 'completed' | 'error';
  createdAt: string;
  modelUrl?: string;
  progress?: number;
  message?: string;
}

interface ScanCaptureProps {
  onModelReady?: (sessionId: string, modelUrl: string) => void;
}

export const ScanCapture = ({ onModelReady }: ScanCaptureProps) => {
  const [sessions, setSessions] = useState<ScanSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ScanSession | null>(null);
  const [newPatientName, setNewPatientName] = useState('');
  const [isPolling, setIsPolling] = useState(false);
  const { toast } = useToast();

  // Generate a new scan session
  const createSession = async () => {
    if (!newPatientName.trim()) return;

    try {
      console.log('Creating session for:', newPatientName.trim());
      
      const response = await fetch('https://3d-scanner-backend.pathakdeesha.workers.dev/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patientName: newPatientName.trim(),
          patientId: null
        })
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', response.headers);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Response error:', errorText);
        throw new Error(`Failed to create session: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Session creation result:', result);
      
      const newSession: ScanSession = {
        sessionId: result.sessionId,
        patientName: newPatientName.trim(),
        status: 'waiting',
        createdAt: new Date().toISOString(),
        progress: 0,
        message: 'Waiting for capture to begin...'
      };

      console.log('Created new session:', newSession);
      setSessions(prev => [...prev, newSession]);
      setSelectedSession(newSession);
      setNewPatientName('');
      
      // Start polling for this session
      startPolling(result.sessionId);
      
      toast({
        title: "Session Created!",
        description: `QR code generated for ${newPatientName.trim()}`,
      });
    } catch (error) {
      console.error('Session creation error:', error);
      toast({
        title: "Session Creation Failed",
        description: "Failed to create scan session",
        variant: "destructive",
      });
    }
  };

  // Poll for session updates
  const startPolling = (sessionId: string) => {
    console.log('Starting polling for session:', sessionId);
    setIsPolling(true);
    
    const pollInterval = setInterval(async () => {
      try {
        console.log('Polling session:', sessionId);
        const response = await fetch(`https://3d-scanner-backend.pathakdeesha.workers.dev/api/model/${sessionId}`);
        
        if (response.ok) {
          const data = await response.json();
          console.log('Polling response for', sessionId, ':', data);
          
          setSessions(prev => prev.map(session => {
            if (session.sessionId === sessionId) {
              const updatedSession = {
                ...session,
                status: data.status || session.status,
                progress: data.progress || session.progress,
                message: data.message || session.message,
                modelUrl: data.modelUrl || session.modelUrl
              };

              console.log('Updated session:', updatedSession);

              // If model is ready, notify parent component
              if (data.status === 'completed' && data.modelUrl && onModelReady) {
                console.log('Model ready, notifying parent:', sessionId, data.modelUrl);
                onModelReady(sessionId, data.modelUrl);
                setIsPolling(false);
                clearInterval(pollInterval);
              }

              return updatedSession;
            }
            return session;
          }));
        } else {
          console.log('Polling failed for', sessionId, ':', response.status, response.statusText);
        }
      } catch (error) {
        console.error('Polling error for', sessionId, ':', error);
      }
    }, 2000); // Poll every 2 seconds

    // Cleanup after 10 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      setIsPolling(false);
    }, 10 * 60 * 1000);
  };

  // Copy session URL to clipboard
  const copySessionUrl = async (sessionId: string) => {
    const sessionUrl = `${window.location.origin}/capture/${sessionId}`;
    
    try {
      await navigator.clipboard.writeText(sessionUrl);
      toast({
        title: "URL Copied!",
        description: "Session URL copied to clipboard",
      });
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Please copy the URL manually",
        variant: "destructive",
      });
    }
  };

  // Download model
  const downloadModel = (session: ScanSession) => {
    if (session.modelUrl) {
      const link = document.createElement('a');
      link.href = session.modelUrl;
      link.download = `gaussian_splat_${session.sessionId}.glb`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600';
      case 'processing': return 'text-blue-600';
      case 'capturing': return 'text-yellow-600';
      case 'error': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'processing': return <RefreshCw className="h-5 w-5 text-blue-600 animate-spin" />;
      case 'capturing': return <Camera className="h-5 w-5 text-yellow-600" />;
      case 'error': return <AlertCircle className="h-5 w-5 text-red-600" />;
      default: return <Wifi className="h-5 w-5 text-gray-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Create New Session */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="patient-name" className="text-sm font-medium">Patient Name</Label>
          <div className="flex gap-2">
            <Input
              id="patient-name"
              placeholder="Enter patient name"
              value={newPatientName}
              onChange={(e) => setNewPatientName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && createSession()}
              className="flex-1"
            />
            <Button 
              onClick={createSession}
              disabled={!newPatientName.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Create Session
            </Button>
          </div>
        </div>
      </div>

      {/* QR Code Display */}
      {selectedSession && (
        <div className="space-y-4">
                      <div className="text-center">
              <div className="bg-white p-4 rounded-lg shadow-sm border inline-block">
                        <QRCodeSVG
          value={`https://4d5eb8ad.3d-scanner-frontend.pages.dev/capture/${selectedSession.sessionId}`}
          size={200}
          level="H"
          includeMargin={true}
          className="w-full h-auto"
        />
              </div>
            </div>
          
          <div className="text-center space-y-2">
            <div className="text-sm font-medium text-gray-700">
              Scan QR code with patient's phone
            </div>
            <div className="text-xs text-gray-500">
              Patient: {selectedSession.patientName}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => copySessionUrl(selectedSession.sessionId)}
            >
              <Copy className="h-4 w-4 mr-1" />
              Copy URL
            </Button>
          </div>
        </div>
      )}

      {/* Simple Status Display */}
      {selectedSession && (
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            {getStatusIcon(selectedSession.status)}
            <span className={`text-sm font-medium ${getStatusColor(selectedSession.status)}`}>
              {selectedSession.status === 'waiting' ? 'Waiting for patient to scan QR code' : 
               selectedSession.status === 'processing' ? 'Processing 3D model...' :
               selectedSession.status === 'completed' ? '3D model ready!' :
               selectedSession.status}
            </span>
          </div>
          
          {selectedSession.status === 'completed' && selectedSession.modelUrl && (
            <Button 
              onClick={() => onModelReady?.(selectedSession.sessionId, selectedSession.modelUrl!)}
              size="sm"
              className="bg-green-600 hover:bg-green-700"
            >
              <Eye className="h-4 w-4 mr-2" />
              View 3D Model
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
