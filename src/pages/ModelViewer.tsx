import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment, PresentationControls } from '@react-three/drei';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ArrowLeft, Download, RotateCw, ZoomIn, ZoomOut, Target } from 'lucide-react';

interface ModelViewerProps {}

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  
  useEffect(() => {
    // Center the model
    if (scene) {
      scene.traverse((child) => {
        if (child.type === 'Mesh') {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
    }
  }, [scene]);

  return <primitive object={scene} />;
}

const ModelViewer: React.FC<ModelViewerProps> = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [landmarks, setLandmarks] = useState<any>(null);
  
  const modelUrl = searchParams.get('model');
  const landmarksUrl = searchParams.get('landmarks');

  useEffect(() => {
    if (!modelUrl) {
      setError('No model URL provided');
      setIsLoading(false);
      return;
    }

    // Load landmarks if available
    if (landmarksUrl) {
      fetch(landmarksUrl)
        .then(response => response.json())
        .then(data => setLandmarks(data))
        .catch(err => console.error('Failed to load landmarks:', err));
    }

    // Test if model URL is accessible
    fetch(modelUrl, { 
      method: 'GET',
      mode: 'cors'
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Model not accessible: ${response.status}`);
        }
        setIsLoading(false);
      })
      .catch(err => {
        setError(`Failed to load model: ${err.message}`);
        setIsLoading(false);
      });
  }, [modelUrl, landmarksUrl]);

  const handleDownload = () => {
    if (modelUrl) {
      const link = document.createElement('a');
      link.href = modelUrl;
      link.download = 'face_model.glb';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleDownloadLandmarks = () => {
    if (landmarks) {
      const dataStr = JSON.stringify(landmarks, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'face_landmarks.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center p-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading 3D model...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-600">Error Loading Model</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/')} className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="absolute top-4 left-4 z-10">
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="bg-white/80 backdrop-blur-sm"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>

      {/* Controls */}
      <div className="absolute top-4 right-4 z-10 space-y-2">
        <Button
          onClick={handleDownload}
          className="bg-white/80 backdrop-blur-sm"
          size="sm"
        >
          <Download className="h-4 w-4 mr-2" />
          Download GLB
        </Button>
        
        {landmarks && (
          <Button
            onClick={handleDownloadLandmarks}
            className="bg-white/80 backdrop-blur-sm"
            size="sm"
          >
            <Target className="h-4 w-4 mr-2" />
            Download Landmarks
          </Button>
        )}
      </div>

      {/* 3D Viewer */}
      <div className="w-full h-screen">
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
            <Model url={modelUrl!} />
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

      {/* Instructions */}
      <div className="absolute bottom-4 left-4 z-10">
        <Card className="bg-white/80 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="space-y-2 text-sm">
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
          </CardContent>
        </Card>
      </div>

      {/* Landmarks Info */}
      {landmarks && (
        <div className="absolute bottom-4 right-4 z-10">
          <Card className="bg-white/80 backdrop-blur-sm max-w-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Facial Landmarks</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 gap-1">
                {Object.entries(landmarks).slice(0, 8).map(([key, value]: [string, any]) => (
                  <Badge key={key} variant="outline" className="text-xs">
                    {key}: {typeof value === 'object' && value.confidence ? value.confidence.toFixed(2) : '✓'}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {Object.keys(landmarks).length} landmarks detected
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ModelViewer;
