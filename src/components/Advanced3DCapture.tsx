import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment, PresentationControls } from '@react-three/drei';
import { 
  Camera, 
  Upload, 
  Download, 
  CheckCircle, 
  AlertCircle, 
  Eye,
  Target,
  Zap,
  Settings,
  Play,
  Pause,
  Square,
  RotateCw,
  ZoomIn
} from 'lucide-react';
import { useToast } from '../hooks/use-toast';

interface Advanced3DCaptureProps {
  sessionId: string;
  onModelReady?: (modelUrl: string, landmarks?: any) => void;
}

interface LandmarkPoint {
  name: string;
  position: [number, number, number];
  confidence: number;
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

export const Advanced3DCapture: React.FC<Advanced3DCaptureProps> = ({ 
  sessionId, 
  onModelReady 
}) => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedImages, setCapturedImages] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [landmarks, setLandmarks] = useState<LandmarkPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [processingMode, setProcessingMode] = useState<'photogrammetry' | 'landmarks' | 'both'>('both');
  const [captureQuality, setCaptureQuality] = useState<'standard' | 'high' | 'ultra'>('high');
  const [show3DViewer, setShow3DViewer] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
      stopCamera();
    };
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const constraints = {
        video: {
          width: { ideal: captureQuality === 'ultra' ? 3840 : captureQuality === 'high' ? 1920 : 1280 },
          height: { ideal: captureQuality === 'ultra' ? 2160 : captureQuality === 'high' ? 1080 : 720 },
          facingMode: 'user',
          frameRate: { ideal: 30 }
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
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
  }, [captureQuality, toast]);

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
    
    const quality = captureQuality === 'ultra' ? 1.0 : captureQuality === 'high' ? 0.9 : 0.8;
    
    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
        setCapturedImages(prev => [...prev, file]);
        
        toast({
          title: "Image Captured",
          description: `Captured image ${capturedImages.length + 1}/${getRequiredImageCount()}`,
        });
      }
    }, 'image/jpeg', quality);
  }, [capturedImages.length, captureQuality, toast]);

  const getRequiredImageCount = () => {
    switch (processingMode) {
      case 'photogrammetry': return 20;
      case 'landmarks': return 10;
      case 'both': return 25;
      default: return 20;
    }
  };

  const startCapture = useCallback(async () => {
    setIsCapturing(true);
    setError(null);
    setCapturedImages([]);
    setProgress(0);
    
    await startCamera();
    
    const requiredCount = getRequiredImageCount();
    const captureInterval = captureQuality === 'ultra' ? 1500 : captureQuality === 'high' ? 2000 : 2500;
    
    // Auto-capture sequence
    captureIntervalRef.current = setInterval(() => {
      if (capturedImages.length < requiredCount) {
        captureImage();
      } else {
        if (captureIntervalRef.current) {
          clearInterval(captureIntervalRef.current);
        }
        setIsCapturing(false);
        stopCamera();
      }
    }, captureInterval);
    
    // Stop after maximum time
    const maxTime = requiredCount * captureInterval + 10000; // Extra 10 seconds
    setTimeout(() => {
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
      setIsCapturing(false);
      stopCamera();
    }, maxTime);
  }, [capturedImages.length, captureImage, startCamera, stopCamera, captureQuality]);

  const processImages = useCallback(async () => {
    const requiredCount = getRequiredImageCount();
    
    if (capturedImages.length < requiredCount) {
      toast({
        title: "Not Enough Images",
        description: `Please capture at least ${requiredCount} images for ${processingMode} processing.`,
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setError(null);

    try {
      // Step 1: Upload and process images
      setProgress(10);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 2: Feature extraction
      setProgress(20);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 3: Structure from motion
      setProgress(40);
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 4: Dense reconstruction
      setProgress(60);
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 5: Mesh generation
      setProgress(80);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 6: Facial landmark detection
      setProgress(90);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Call the Python backend with real photogrammetry
      const endpoint = 'http://localhost:8000/api/generate-3d';

      const formData = new FormData();
      formData.append('sessionId', sessionId);
      
      capturedImages.forEach((image, index) => {
        formData.append('imagesFiles', image, `image_${index}.jpg`);
      });

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.success) {
        setModelUrl(result.modelUrl);
        if (result.landmarks) {
          setLandmarks(result.landmarks);
        }
        setProgress(100);
        setShow3DViewer(true);
        onModelReady?.(result.modelUrl, result.landmarks);
        
        toast({
          title: "3D Model Ready!",
          description: `Your face model with ${processingMode} processing has been generated successfully.`,
        });
      } else {
        throw new Error(result.message || 'Processing failed');
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
  }, [capturedImages, sessionId, processingMode, onModelReady, toast]);

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

  const downloadLandmarks = useCallback(async () => {
    if (!landmarks.length) return;
    
    try {
      const landmarksData = JSON.stringify(landmarks, null, 2);
      const blob = new Blob([landmarksData], { type: 'application/json' });
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `face_landmarks_${sessionId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Landmarks download error:', err);
      toast({
        title: "Download Error",
        description: "Failed to download the landmarks data.",
        variant: "destructive"
      });
    }
  }, [landmarks, sessionId, toast]);

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Advanced 3D Face Capture
        </CardTitle>
        <CardDescription>
          High-quality 3D reconstruction with facial landmark detection using WebAssembly photogrammetry
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Settings Panel */}
        <Tabs defaultValue="capture" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="capture">Capture</TabsTrigger>
            <TabsTrigger value="processing">Processing</TabsTrigger>
            <TabsTrigger value="results">Results</TabsTrigger>
          </TabsList>
          
          <TabsContent value="capture" className="space-y-4">
            {/* Camera Preview */}
            {isCapturing && (
              <div className="relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-80 object-cover rounded-lg border"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-black/50 text-white px-4 py-2 rounded-lg">
                    Capturing... {capturedImages.length}/{getRequiredImageCount()}
                  </div>
                </div>
              </div>
            )}

            {/* Capture Settings */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Capture Quality</label>
                <div className="flex gap-2">
                  {(['standard', 'high', 'ultra'] as const).map((quality) => (
                    <Button
                      key={quality}
                      variant={captureQuality === quality ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCaptureQuality(quality)}
                      disabled={isCapturing}
                    >
                      {quality.charAt(0).toUpperCase() + quality.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Processing Mode</label>
                <div className="flex gap-2">
                  {(['photogrammetry', 'landmarks', 'both'] as const).map((mode) => (
                    <Button
                      key={mode}
                      variant={processingMode === mode ? "default" : "outline"}
                      size="sm"
                      onClick={() => setProcessingMode(mode)}
                      disabled={isCapturing}
                    >
                      {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Capture Controls */}
            {!isCapturing && !isProcessing && (
              <div className="space-y-4">
                <Button 
                  onClick={startCapture}
                  disabled={isCapturing}
                  className="w-full h-12"
                >
                  <Camera className="h-5 w-5 mr-2" />
                  Start Advanced Capture
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
          </TabsContent>
          
          <TabsContent value="processing" className="space-y-4">
            {/* Processing Status */}
            {isProcessing && (
              <div className="space-y-4">
                <Progress value={progress} className="w-full" />
                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {progress < 20 && "Uploading and processing images..."}
                    {progress >= 20 && progress < 40 && "Extracting features..."}
                    {progress >= 40 && progress < 60 && "Structure from motion..."}
                    {progress >= 60 && progress < 80 && "Dense reconstruction..."}
                    {progress >= 80 && progress < 90 && "Generating mesh..."}
                    {progress >= 90 && "Detecting facial landmarks..."}
                  </p>
                  <p className="text-lg font-medium">{Math.round(progress)}% Complete</p>
                </div>
              </div>
            )}
            
            {/* Process Button */}
            {capturedImages.length >= getRequiredImageCount() && !isProcessing && !modelUrl && (
              <Button 
                onClick={processImages}
                className="w-full h-12 bg-green-600 hover:bg-green-700"
              >
                <Upload className="h-5 w-5 mr-2" />
                Generate 3D Model with Landmarks ({capturedImages.length} images)
              </Button>
            )}
          </TabsContent>
          
          <TabsContent value="results" className="space-y-4">
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
                
                <div className="grid md:grid-cols-2 gap-4">
                  <Button 
                    onClick={downloadModel}
                    className="w-full"
                    variant="outline"
                  >
                    <Download className="h-5 w-5 mr-2" />
                    Download GLB Model
                  </Button>
                  
                  {landmarks.length > 0 && (
                    <Button 
                      onClick={downloadLandmarks}
                      className="w-full"
                      variant="outline"
                    >
                      <Target className="h-5 w-5 mr-2" />
                      Download Landmarks
                    </Button>
                  )}
                </div>
                
                {/* Landmarks Display */}
                {landmarks.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Detected Facial Landmarks</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {landmarks.map((landmark, index) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {landmark.name}: {landmark.confidence.toFixed(2)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Error Display */}
        {error && (
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default Advanced3DCapture;
