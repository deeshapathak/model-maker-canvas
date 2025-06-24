import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Camera, Upload, Download, RotateCcw, CheckCircle, AlertCircle, Image } from 'lucide-react';

interface PhotogrammetryCaptureProps {
  onModelGenerated: (modelUrl: string) => void;
  onScanComplete: (scanData: any) => void;
}

interface CaptureStatus {
  status: 'idle' | 'capturing' | 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;
  message: string;
  modelUrl?: string;
  error?: string;
}

export const PhotogrammetryCapture = ({ onModelGenerated, onScanComplete }: PhotogrammetryCaptureProps) => {
  const [captureStatus, setCaptureStatus] = useState<CaptureStatus>({
    status: 'idle',
    progress: 0,
    message: 'Ready to capture your face'
  });
  
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        }
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      setCaptureStatus({
        status: 'error',
        progress: 0,
        message: 'Failed to access camera',
        error: 'Camera access denied'
      });
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const captureImage = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw video frame to canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Convert to blob
    canvas.toBlob((blob) => {
      if (blob) {
        const imageUrl = URL.createObjectURL(blob);
        setCapturedImages(prev => [...prev, imageUrl]);
        
        if (capturedImages.length >= 5) {
          setIsCapturing(false);
          stopCamera();
        }
      }
    }, 'image/jpeg', 0.9);
  }, [capturedImages.length, stopCamera]);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newImages: string[] = [];
    Array.from(files).forEach(file => {
      const imageUrl = URL.createObjectURL(file);
      newImages.push(imageUrl);
    });

    setCapturedImages(prev => [...prev, ...newImages]);
  }, []);

  const uploadToPhotogrammetry = async (images: File[]): Promise<string> => {
    console.log('Starting photogrammetry upload...');
    
    // Create form data
    const formData = new FormData();
    images.forEach((image, index) => {
      formData.append('images', image);
    });

    // Upload to local backend
    const response = await fetch(`http://localhost:3001/api/photogrammetry/capture`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `Upload failed: ${response.status}`);
    }

    const result = await response.json();
    console.log('Upload result:', result);

    // Use the session ID from the response
    const sessionId = result.sessionId;

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes with 5-second intervals

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

      const statusResponse = await fetch(`http://localhost:3001/api/photogrammetry/status/${sessionId}`);
      
      if (!statusResponse.ok) {
        throw new Error('Failed to check status');
      }

      const statusData = await statusResponse.json();
      
      setCaptureStatus(prev => ({
        ...prev,
        progress: statusData.progress,
        message: statusData.message
      }));

      if (statusData.status === 'completed') {
        return statusData.glb_url;
      }

      if (statusData.status === 'error') {
        throw new Error(statusData.message || 'Processing failed');
      }

      attempts++;
    }

    throw new Error('Processing timeout');
  };

  const handleStartCapture = async () => {
    setIsCapturing(true);
    setCapturedImages([]);
    setCaptureStatus({
      status: 'capturing',
      progress: 0,
      message: 'Starting camera...'
    });

    await startCamera();
    setCaptureStatus({
      status: 'capturing',
      progress: 0,
      message: 'Camera ready. Take photos from different angles.'
    });
  };

  const handleProcessImages = async () => {
    if (capturedImages.length < 3) {
      setCaptureStatus({
        status: 'error',
        progress: 0,
        message: 'Please capture at least 3 images',
        error: 'Insufficient images'
      });
      return;
    }

    try {
      setCaptureStatus({
        status: 'uploading',
        progress: 0,
        message: 'Preparing images...'
      });

      // Convert image URLs to files
      const imageFiles: File[] = [];
      for (const imageUrl of capturedImages) {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
        imageFiles.push(file);
      }

      setCaptureStatus({
        status: 'uploading',
        progress: 10,
        message: 'Uploading images...'
      });

      const modelUrl = await uploadToPhotogrammetry(imageFiles);

      setCaptureStatus({
        status: 'completed',
        progress: 100,
        message: '3D model generated successfully!',
        modelUrl
      });

      onModelGenerated(modelUrl);
      onScanComplete({ images: capturedImages.length, modelUrl });

    } catch (error) {
      console.error('Photogrammetry error:', error);
      let errorMessage = 'An unexpected error occurred';
      
      if (error instanceof Error) {
        if (error.message.includes('Network')) {
          errorMessage = 'Network error: Unable to connect to photogrammetry server.';
        } else if (error.message.includes('timeout')) {
          errorMessage = 'Processing timeout: The operation took too long.';
        } else {
          errorMessage = error.message;
        }
      }

      setCaptureStatus({
        status: 'error',
        progress: 0,
        message: errorMessage,
        error: errorMessage
      });
    }
  };

  const handleReset = () => {
    setCapturedImages([]);
    setCaptureStatus({
      status: 'idle',
      progress: 0,
      message: 'Ready to capture your face'
    });
    stopCamera();
    setIsCapturing(false);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          Photogrammetry Capture
        </CardTitle>
        <CardDescription>
          Capture multiple photos from different angles to generate a 3D face model
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Status Display */}
        {captureStatus.status !== 'idle' && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{captureStatus.message}</AlertDescription>
          </Alert>
        )}

        {/* Progress Bar */}
        {captureStatus.status === 'uploading' || captureStatus.status === 'processing' ? (
          <div className="space-y-2">
            <Progress value={captureStatus.progress} className="w-full" />
            <p className="text-sm text-gray-600">{captureStatus.progress}% complete</p>
          </div>
        ) : null}

        {/* Camera View */}
        {isCapturing && (
          <div className="relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full rounded-lg border"
            />
            <canvas ref={canvasRef} className="hidden" />
            
            <div className="mt-4 flex gap-2">
              <Button onClick={captureImage} disabled={capturedImages.length >= 10}>
                <Camera className="h-4 w-4 mr-2" />
                Capture Photo ({capturedImages.length}/10)
              </Button>
              <Button variant="outline" onClick={stopCamera}>
                Stop Camera
              </Button>
            </div>
          </div>
        )}

        {/* File Upload */}
        {!isCapturing && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600 mb-2">
                Or upload existing photos
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <Image className="h-4 w-4 mr-2" />
                Select Images
              </Button>
            </div>
          </div>
        )}

        {/* Captured Images */}
        {capturedImages.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Captured Images ({capturedImages.length})</h4>
            <div className="grid grid-cols-3 gap-2 max-h-32 overflow-y-auto">
              {capturedImages.map((imageUrl, index) => (
                <img
                  key={index}
                  src={imageUrl}
                  alt={`Capture ${index + 1}`}
                  className="w-full h-20 object-cover rounded border"
                />
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          {!isCapturing && capturedImages.length === 0 && (
            <Button onClick={handleStartCapture} className="flex-1">
              <Camera className="h-4 w-4 mr-2" />
              Start Camera Capture
            </Button>
          )}
          
          {capturedImages.length >= 3 && (
            <Button 
              onClick={handleProcessImages}
              disabled={captureStatus.status === 'uploading' || captureStatus.status === 'processing'}
              className="flex-1"
            >
              {captureStatus.status === 'uploading' || captureStatus.status === 'processing' ? (
                <>
                  <RotateCcw className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Generate 3D Model
                </>
              )}
            </Button>
          )}
          
          {capturedImages.length > 0 && (
            <Button variant="outline" onClick={handleReset}>
              Reset
            </Button>
          )}
        </div>

        {/* Success Message */}
        {captureStatus.status === 'completed' && (
          <Alert>
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-600">
              3D model generated successfully! You can now view and edit it.
            </AlertDescription>
          </Alert>
        )}

        {/* Error Message */}
        {captureStatus.status === 'error' && (
          <Alert>
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-600">
              {captureStatus.error}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};
