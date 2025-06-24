import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { ArrowLeft, Camera, Download, Zap, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Simple3DCapture from '../components/Simple3DCapture';
import Advanced3DCapture from '../components/Advanced3DCapture';
import { useToast } from '../hooks/use-toast';

const CapturePage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [landmarks, setLandmarks] = useState<any>(null);
  const [captureMode, setCaptureMode] = useState<'simple' | 'advanced'>('simple');

  const handleModelReady = (url: string, landmarkData?: any) => {
    setModelUrl(url);
    setLandmarks(landmarkData);
    toast({
      title: "Success!",
      description: "Your 3D face model has been generated and is ready to view.",
    });
  };

  // Removed handleViewModel since 3D model is now shown directly in the component

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          
          <div className="flex items-center gap-3">
            <Camera className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">3D Face Scanner v5</h1>
              <p className="text-gray-600">Session: {sessionId}</p>
            </div>
          </div>
        </div>

        {/* Mode Selection */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Choose Capture Mode</CardTitle>
            <CardDescription>
              Select between simple capture or advanced processing with facial landmark detection
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={captureMode} onValueChange={(value) => setCaptureMode(value as 'simple' | 'advanced')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="simple" className="flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  Simple Capture
                </TabsTrigger>
                <TabsTrigger value="advanced" className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Advanced Processing
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="simple" className="mt-4">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Camera className="h-4 w-4" />
                    <span>Basic 3D model generation with 10 photos</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Target className="h-4 w-4" />
                    <span>Standard quality, fast processing</span>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="advanced" className="mt-4">
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Zap className="h-4 w-4" />
                    <span>High-quality 3D reconstruction with facial landmark detection</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Target className="h-4 w-4" />
                    <span>WebAssembly photogrammetry + geometric landmark detection</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Download className="h-4 w-4" />
                    <span>Export GLB model + landmark data</span>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>How to Capture Your Face</CardTitle>
            <CardDescription>
              Follow these steps to create a high-quality 3D model of your face
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-semibold">📱 Preparation</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Ensure good lighting (natural light is best)</li>
                  <li>• Remove glasses and accessories</li>
                  <li>• Find a quiet, well-lit space</li>
                  <li>• Keep your phone steady</li>
                </ul>
              </div>
              <div className="space-y-2">
                <h4 className="font-semibold">🎯 During Capture</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Stay centered in the frame</li>
                  <li>• Slowly rotate your head</li>
                  <li>• Keep a neutral expression</li>
                  <li>• Don't move too quickly</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Capture Component */}
        {captureMode === 'simple' ? (
          <Simple3DCapture 
            sessionId={sessionId || ''} 
            onModelReady={handleModelReady}
          />
        ) : (
          <Advanced3DCapture 
            sessionId={sessionId || ''} 
            onModelReady={handleModelReady}
          />
        )}

        {/* Model Actions */}
        {modelUrl && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Your 3D Model is Ready!
              </CardTitle>
              <CardDescription>
                Your face model has been generated successfully. You can download it or view it in 3D.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <Button 
                  variant="outline"
                  onClick={() => window.open(modelUrl, '_blank')}
                  className="flex-1"
                >
                  Download GLB
                </Button>
              </div>
              
              {landmarks && (
                <div className="space-y-2">
                  <h4 className="font-medium">Facial Landmarks Detected</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {Object.entries(landmarks).slice(0, 6).map(([key, value]: [string, any]) => (
                      <Badge key={key} variant="outline" className="text-xs">
                        {key}: {typeof value === 'object' && value.confidence ? value.confidence.toFixed(2) : '✓'}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {Object.keys(landmarks).length} landmarks detected using geometric properties
                  </p>
                </div>
              )}
              
              <div className="text-sm text-gray-600">
                <p>Model URL: <code className="bg-gray-100 px-2 py-1 rounded">{modelUrl}</code></p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default CapturePage;
