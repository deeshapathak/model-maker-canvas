import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment, PresentationControls } from '@react-three/drei';
import { Camera, Upload, Download, CheckCircle, AlertCircle, RotateCw, ZoomIn, Target } from 'lucide-react';
import { useToast } from '../hooks/use-toast';

interface Simple3DCaptureProps {
  sessionId: string;
  onModelReady?: (modelUrl: string) => void;
}

// 3D Model Component
function Model({ url }: { url: string }) {
  const { scene, errors } = useGLTF(url, true); // Add true for draco compression support
  
  useEffect(() => {
    if (scene) {
      scene.traverse((child) => {
        if (child.type === 'Mesh') {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
    }
  }, [scene]);

  if (errors && errors.length > 0) {
    console.error('GLB loading errors:', errors);
    return (
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="red" />
      </mesh>
    );
  }

  return <primitive object={scene} />;
}

export const Simple3DCapture: React.FC<Simple3DCaptureProps> = ({ 
  sessionId, 
  onModelReady 
}) => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedImages, setCapturedImages] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [show3DViewer, setShow3DViewer] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const { toast } = useToast();

  const startCamera = useCallback(async () => {
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
    } catch (err) {
      console.error('Camera access error:', err);
      toast({
        title: "Camera Error",
        description: "Unable to access camera. Please check permissions.",
        variant: "destructive"
      });
    }
  }, [toast]);

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
    if (!videoRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(videoRef.current, 0, 0);
    
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
        setCapturedImages(prev => [...prev, file]);
        
        toast({
          title: "Image Captured",
          description: `Captured image ${capturedImages.length + 1}/10`,
        });
      }
    }, 'image/jpeg', 0.9);
  }, [capturedImages.length, toast]);

  const startCapture = useCallback(async () => {
    setIsCapturing(true);
    setError(null);
    setCapturedImages([]);
    setProgress(0);
    
    await startCamera();
    
    // Auto-capture sequence
    const captureInterval = setInterval(() => {
      if (capturedImages.length < 10) {
        captureImage();
      } else {
        clearInterval(captureInterval);
        setIsCapturing(false);
        stopCamera();
      }
    }, 2000); // Capture every 2 seconds
    
    // Stop after 20 seconds
    setTimeout(() => {
      clearInterval(captureInterval);
      setIsCapturing(false);
      stopCamera();
    }, 20000);
  }, [capturedImages.length, captureImage, startCamera, stopCamera]);

  const processImages = useCallback(async () => {
    if (capturedImages.length < 5) {
      toast({
        title: "Not Enough Images",
        description: "Please capture at least 5 images for 3D reconstruction.",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('sessionId', sessionId);
      
      capturedImages.forEach((image, index) => {
        formData.append('imagesFiles', image, `image_${index}.jpg`);
      });

      // Simulate processing steps
      const steps = [
        'Uploading images...',
        'Analyzing face features...',
        'Generating 3D geometry...',
        'Creating texture maps...',
        'Finalizing model...'
      ];

      for (let i = 0; i < steps.length; i++) {
        setProgress((i / steps.length) * 100);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Call the backend
      const response = await fetch('http://localhost:8000/api/generate-3d', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.success) {
        setModelUrl(result.modelUrl);
        setProgress(100);
        setShow3DViewer(true);
        onModelReady?.(result.modelUrl);
        
        toast({
          title: "3D Model Ready!",
          description: "Your face model has been generated successfully.",
        });
      } else {
        throw new Error(result.message || '3D generation failed');
      }

    } catch (err) {
      console.error('Processing error:', err);
      setError(err instanceof Error ? err.message : 'Processing failed');
      
      toast({
        title: "Processing Error",
        description: err instanceof Error ? err.message : 'Failed to generate 3D model',
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  }, [capturedImages, sessionId, onModelReady, toast]);

  const downloadModel = useCallback(async () => {
    if (!modelUrl) return;
    
    try {
      const response = await fetch(modelUrl);
      const blob = await response.blob();
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `face_model_${sessionId}.glb`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download error:', err);
      toast({
        title: "Download Error",
        description: "Failed to download the 3D model.",
        variant: "destructive"
      });
    }
  }, [modelUrl, sessionId, toast]);

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          Simple 3D Face Capture
        </CardTitle>
        <CardDescription>
          Capture 10 photos of your face from different angles to generate a 3D model
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Camera Preview */}
        {isCapturing && (
          <div className="relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-64 object-cover rounded-lg border"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-black/50 text-white px-4 py-2 rounded-lg">
                Capturing... {capturedImages.length}/10
              </div>
            </div>
          </div>
        )}

        {/* Capture Controls */}
        {!isCapturing && !isProcessing && (
          <div className="space-y-4">
            <Button 
              onClick={startCapture}
              disabled={isCapturing}
              className="w-full h-12"
            >
              <Camera className="h-5 w-5 mr-2" />
              Start Face Capture
            </Button>
            
            {capturedImages.length > 0 && (
              <div className="text-center">
                <Badge variant="secondary">
                  {capturedImages.length} images captured
                </Badge>
              </div>
            )}
          </div>
        )}

        {/* Processing */}
        {isProcessing && (
          <div className="space-y-4">
            <Progress value={progress} className="w-full" />
            <p className="text-center text-sm text-muted-foreground">
              Generating 3D model... {Math.round(progress)}%
            </p>
          </div>
        )}

        {/* Results */}
        {modelUrl && !isProcessing && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">3D Model Generated Successfully!</span>
            </div>
            
            {/* 3D Viewer */}
            {show3DViewer && modelUrl && (
              <div className="w-full h-96 rounded-lg border overflow-hidden">
                <Canvas
                  camera={{ position: [0, 0, 5], fov: 50 }}
                  shadows
                  gl={{ antialias: true }}
                >
                  <ambientLight intensity={0.5} />
                  <directionalLight
                    position={[10, 10, 5]}
                    intensity={1}
                    castShadow
                    shadow-mapSize-width={2048}
                    shadow-mapSize-height={2048}
                  />
                  
                  <PresentationControls
                    global
                    config={{ mass: 2, tension: 500 }}
                    snap={{ mass: 4, tension: 1500 }}
                    rotation={[0, 0, 0]}
                    polar={[-Math.PI / 3, Math.PI / 3]}
                    azimuth={[-Math.PI / 1.4, 0.75]}
                  >
                    <Model url={modelUrl} />
                  </PresentationControls>
                  
                  <OrbitControls
                    enablePan={true}
                    enableZoom={true}
                    enableRotate={true}
                    minDistance={2}
                    maxDistance={10}
                  />
                  
                  <Environment preset="studio" />
                </Canvas>
              </div>
            )}
            
            {/* Instructions */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium mb-2">How to interact with your 3D model:</h4>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <RotateCw className="h-4 w-4" />
                  <span>Drag to rotate</span>
                </div>
                <div className="flex items-center gap-2">
                  <ZoomIn className="h-4 w-4" />
                  <span>Scroll to zoom</span>
                </div>
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  <span>Right-click to pan</span>
                </div>
              </div>
            </div>
            
            <Button 
              onClick={downloadModel}
              className="w-full"
              variant="outline"
            >
              <Download className="h-5 w-5 mr-2" />
              Download GLB Model
            </Button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        )}

        {/* Process Button */}
        {capturedImages.length >= 5 && !isProcessing && !modelUrl && (
          <Button 
            onClick={processImages}
            className="w-full h-12 bg-green-600 hover:bg-green-700"
          >
            <Upload className="h-5 w-5 mr-2" />
            Generate 3D Model ({capturedImages.length} images)
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default Simple3DCapture;
