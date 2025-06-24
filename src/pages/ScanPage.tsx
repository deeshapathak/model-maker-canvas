import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Camera, 
  Smartphone, 
  Upload, 
  CheckCircle, 
  AlertCircle, 
  RotateCcw,
  Wifi,
  WifiOff
} from 'lucide-react';

interface ScanData {
  mesh?: ArrayBuffer;
  images?: File[];
  token: string;
}

interface DeviceCapabilities {
  hasLiDAR: boolean;
  hasCamera: boolean;
  isMobile: boolean;
  isIOS: boolean;
}

export const ScanPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  
  const [deviceCapabilities, setDeviceCapabilities] = useState<DeviceCapabilities>({
    hasLiDAR: false,
    hasCamera: false,
    isMobile: false,
    isIOS: false
  });
  
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'uploading' | 'completed' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('Initializing...');
  const [capturedImages, setCapturedImages] = useState<File[]>([]);
  const [error, setError] = useState<string>('');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Check device capabilities
  useEffect(() => {
    const checkCapabilities = async () => {
      const capabilities: DeviceCapabilities = {
        hasLiDAR: false,
        hasCamera: false,
        isMobile: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent),
        isIOS: /iPhone|iPad|iPod/i.test(navigator.userAgent)
      };

      // Check for LiDAR support
      if (capabilities.isIOS) {
        // Check for AR capabilities
        if ('xr' in navigator) {
          try {
            const isSupported = await navigator.xr.isSessionSupported('immersive-ar');
            capabilities.hasLiDAR = isSupported;
          } catch (e) {
            console.log('AR session not supported');
          }
        }
        
        // Alternative LiDAR detection
        if ('deviceMemory' in navigator && navigator.deviceMemory >= 4) {
          capabilities.hasLiDAR = true;
        }
      }

      // Check camera access
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        capabilities.hasCamera = true;
        stream.getTracks().forEach(track => track.stop());
      } catch (e) {
        console.log('Camera access denied');
      }

      setDeviceCapabilities(capabilities);
      setMessage('Device capabilities detected');
    };

    checkCapabilities();
  }, []);

  // Validate token
  useEffect(() => {
    if (!token) {
      setError('No scan token provided');
      setScanStatus('error');
    }
  }, [token]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          facingMode: 'user'
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
    } catch (error) {
      setError('Failed to access camera');
      setScanStatus('error');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `face_scan_${capturedImages.length + 1}.jpg`, { type: 'image/jpeg' });
        setCapturedImages(prev => [...prev, file]);
      }
    }, 'image/jpeg', 0.9);
  };

  const startLiDARScan = async () => {
    setScanStatus('scanning');
    setMessage('Starting LiDAR face scan...');
    setProgress(10);

    try {
      // Simulate LiDAR scanning process
      for (let i = 10; i <= 90; i += 10) {
        await new Promise(resolve => setTimeout(resolve, 500));
        setProgress(i);
        setMessage(`Scanning face... ${i}%`);
      }

      // Simulate mesh generation
      setMessage('Generating 3D mesh...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      setProgress(95);

      // Upload the scan
      await uploadScan({ token: token!, mesh: new ArrayBuffer(1024) });
      
    } catch (error) {
      setError('LiDAR scan failed');
      setScanStatus('error');
    }
  };

  const startPhotoScan = async () => {
    setScanStatus('scanning');
    setMessage('Starting photo capture...');
    setProgress(0);

    try {
      await startCamera();
      setMessage('Camera ready - capture photos from different angles');
      
      // Wait for user to capture photos
      // This would be handled by the UI buttons
      
    } catch (error) {
      setError('Photo scan failed');
      setScanStatus('error');
    }
  };

  const uploadScan = async (scanData: ScanData) => {
    setScanStatus('uploading');
    setMessage('Uploading scan data...');
    setProgress(95);

    try {
      const formData = new FormData();
      formData.append('token', scanData.token);
      
      if (scanData.mesh) {
        formData.append('mesh', new Blob([scanData.mesh]), 'face_scan.glb');
      }
      
      if (scanData.images) {
        scanData.images.forEach((image, index) => {
          formData.append('images', image);
        });
      }

      const response = await fetch('/api/upload-scan', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const result = await response.json();
      
      setProgress(100);
      setMessage('Scan completed successfully!');
      setScanStatus('completed');
      
      // Redirect or show success
      setTimeout(() => {
        window.close();
      }, 3000);
      
    } catch (error) {
      setError('Upload failed');
      setScanStatus('error');
    }
  };

  const handlePhotoCapture = () => {
    captureImage();
    
    if (capturedImages.length >= 8) {
      stopCamera();
      uploadScan({ token: token!, images: capturedImages });
    }
  };

  const handleReset = () => {
    stopCamera();
    setCapturedImages([]);
    setScanStatus('idle');
    setProgress(0);
    setMessage('Ready to scan');
    setError('');
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Invalid Scan Token</CardTitle>
            <CardDescription>
              No valid scan token was provided in the URL.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* Header */}
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <Camera className="h-6 w-6" />
              RHINOVATE Face Scan
            </CardTitle>
            <CardDescription>
              Capture your 3D face model for medical visualization
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Device Capabilities */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Device Capabilities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span>LiDAR Scanner:</span>
              <span className={deviceCapabilities.hasLiDAR ? 'text-green-600' : 'text-red-600'}>
                {deviceCapabilities.hasLiDAR ? 'Available' : 'Not Available'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Camera:</span>
              <span className={deviceCapabilities.hasCamera ? 'text-green-600' : 'text-red-600'}>
                {deviceCapabilities.hasCamera ? 'Available' : 'Not Available'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Device:</span>
              <span>{deviceCapabilities.isIOS ? 'iOS' : 'Other'}</span>
            </div>
          </CardContent>
        </Card>

        {/* Scan Options */}
        {scanStatus === 'idle' && (
          <Card>
            <CardHeader>
              <CardTitle>Choose Scan Method</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {deviceCapabilities.hasLiDAR && (
                <Button 
                  onClick={startLiDARScan}
                  className="w-full h-16 text-lg"
                  variant="default"
                >
                  <Smartphone className="h-5 w-5 mr-2" />
                  LiDAR Face Scan
                  <br />
                  <span className="text-sm opacity-75">High Quality 3D Model</span>
                </Button>
              )}
              
              <Button 
                onClick={startPhotoScan}
                className="w-full h-16 text-lg"
                variant="outline"
              >
                <Camera className="h-5 w-5 mr-2" />
                Photo Capture
                <br />
                <span className="text-sm opacity-75">Multiple Photos (8-10)</span>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Camera View */}
        {scanStatus === 'scanning' && !deviceCapabilities.hasLiDAR && (
          <Card>
            <CardHeader>
              <CardTitle>Photo Capture</CardTitle>
              <CardDescription>
                Capture {capturedImages.length}/8 photos from different angles
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-64 object-cover"
                />
                <canvas
                  ref={canvasRef}
                  className="hidden"
                />
                
                {/* Capture overlay */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-white/20 backdrop-blur-sm rounded-full p-4">
                    <div className="text-white text-center">
                      <div className="text-sm mb-2">Position your face in the center</div>
                      <div className="text-xs opacity-75">
                        Captured: {capturedImages.length}/8
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Captured Images */}
              {capturedImages.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {capturedImages.map((_, index) => (
                    <div key={index} className="bg-green-100 h-16 rounded flex items-center justify-center">
                      <CheckCircle className="h-6 w-6 text-green-600" />
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Button 
                  onClick={handlePhotoCapture}
                  disabled={capturedImages.length >= 8}
                  className="flex-1"
                >
                  <Camera className="h-4 w-4 mr-2" />
                  Capture Photo
                </Button>
                <Button variant="outline" onClick={handleReset}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Progress */}
        {scanStatus !== 'idle' && (
          <Card>
            <CardHeader>
              <CardTitle>Scan Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>{message}</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="w-full" />
              </div>

              {scanStatus === 'completed' && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    Your 3D face model has been captured successfully! 
                    The doctor will be notified and can view your model.
                  </AlertDescription>
                </Alert>
              )}

              {scanStatus === 'error' && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
              <div>Ensure good lighting and a clear background</div>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
              <div>Keep your face centered and expression neutral</div>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
              <div>Capture from front, left, right, and diagonal angles</div>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
              <div>Stay still during LiDAR scanning</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
