import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Eye, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  Smartphone,
  Download
} from 'lucide-react';
import { usePatientScan } from '@/hooks/usePatientScan';
import { ModelViewer } from './ModelViewer';

interface PatientScanViewerProps {
  token: string;
  patientName?: string;
  onModelLoaded?: (glbUrl: string) => void;
}

export const PatientScanViewer = ({ 
  token, 
  patientName, 
  onModelLoaded 
}: PatientScanViewerProps) => {
  const [show3DViewer, setShow3DViewer] = useState(false);
  
  const {
    scanStatus,
    isPolling,
    isLoading,
    error,
    checkScanStatus,
    startPolling,
    stopPolling,
    resetScan
  } = usePatientScan({ token });

  const handleViewModel = () => {
    if (scanStatus.glbUrl) {
      setShow3DViewer(true);
      onModelLoaded?.(scanStatus.glbUrl);
    }
  };

  const handleDownloadModel = () => {
    if (scanStatus.glbUrl) {
      const link = document.createElement('a');
      link.href = scanStatus.glbUrl;
      link.download = `patient_scan_${token}.glb`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="space-y-4">
      {/* Scan Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            Patient Scan Status
            {patientName && (
              <Badge variant="secondary">{patientName}</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Token: {token}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Status Display */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {scanStatus.status === 'completed' && (
                <CheckCircle className="h-5 w-5 text-green-600" />
              )}
              {scanStatus.status === 'processing' && (
                <Clock className="h-5 w-5 text-blue-600" />
              )}
              {scanStatus.status === 'error' && (
                <AlertCircle className="h-5 w-5 text-red-600" />
              )}
              
              <span className="font-medium">
                {scanStatus.status === 'completed' && 'Scan Completed'}
                {scanStatus.status === 'processing' && 'Processing Scan'}
                {scanStatus.status === 'error' && 'Scan Error'}
              </span>
            </div>
            
            <Badge 
              variant={scanStatus.status === 'completed' ? 'default' : 'secondary'}
            >
              {scanStatus.status}
            </Badge>
          </div>

          {/* Progress Bar */}
          {scanStatus.status === 'processing' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>{scanStatus.message || 'Processing...'}</span>
                {isPolling && (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                )}
              </div>
              <Progress value={isLoading ? undefined : 50} className="w-full" />
            </div>
          )}

          {/* Completion Info */}
          {scanStatus.status === 'completed' && scanStatus.completedAt && (
            <div className="text-sm text-gray-600">
              Completed: {formatTime(scanStatus.completedAt)}
            </div>
          )}

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            {scanStatus.status === 'completed' ? (
              <>
                <Button onClick={handleViewModel} className="flex-1">
                  <Eye className="h-4 w-4 mr-2" />
                  View 3D Model
                </Button>
                <Button variant="outline" onClick={handleDownloadModel}>
                  <Download className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <Button 
                  onClick={checkScanStatus} 
                  disabled={isLoading}
                  className="flex-1"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Check Status
                </Button>
                <Button 
                  variant="outline" 
                  onClick={isPolling ? stopPolling : startPolling}
                >
                  {isPolling ? 'Stop Polling' : 'Start Polling'}
                </Button>
              </>
            )}
            
            <Button variant="outline" onClick={resetScan}>
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 3D Model Viewer */}
      {show3DViewer && scanStatus.glbUrl && (
        <Card>
          <CardHeader>
            <CardTitle>3D Face Model</CardTitle>
            <CardDescription>
              Interactive 3D visualization of patient's face scan
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-96 rounded-lg overflow-hidden border">
              <ModelViewer 
                modelPath={scanStatus.glbUrl}
                deformationStrength={0.1}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
            <div>Patient scans QR code with iPhone</div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
            <div>LiDAR or camera captures 3D face data</div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
            <div>Data is processed into GLB format</div>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
            <div>3D model appears here automatically</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
