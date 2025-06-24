import { useState, useEffect } from "react";
import { ModelViewer } from "@/components/ModelViewer";
import { ModelControls } from "@/components/ModelControls";
import { HealingPreviews } from "@/components/HealingPreviews";
import { AIRecommendations } from "@/components/AIRecommendations";
import { PatientInfo } from "@/components/PatientInfo";
import { ScanCapture } from "@/components/ScanCapture";
import { GaussianModelViewer } from "@/components/GaussianModelViewer";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Zap, 
  Smartphone, 
  Eye,
  QrCode,
  Camera,
  Settings,
  TestTube
} from "lucide-react";

interface ScanSession {
  sessionId: string;
  patientName: string;
  status: 'waiting' | 'capturing' | 'processing' | 'completed' | 'error';
  createdAt: string;
  modelUrl?: string;
  progress?: number;
  message?: string;
}

const Index = () => {
  console.log('Index component loading...');
  const [deformationStrength, setDeformationStrength] = useState(0.1);
  const [isModelSaved, setIsModelSaved] = useState(false);
  const [currentModelPath, setCurrentModelPath] = useState('/models/elon-musk.glb');
  const [modelType, setModelType] = useState<'default' | 'gaussian'>('default');
  const [isLoading, setIsLoading] = useState(true);
  
  // Gaussian Splatting session state
  const [sessions, setSessions] = useState<ScanSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<ScanSession | null>(null);
  const [currentModelUrl, setCurrentModelUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('gaussian-capture');

  const handleDeformationStrengthChange = (strength: number) => {
    setDeformationStrength(strength);
  };

  const handleSaveModel = () => {
    setIsModelSaved(true);
  };

  const handleModelChange = (modelPath: string, type: 'default' | 'gaussian') => {
    setCurrentModelPath(modelPath);
    setModelType(type);
  };

  // Handle Gaussian Splatting model ready
  const handleGaussianModelReady = (sessionId: string, modelUrl: string) => {
    console.log('Model ready callback triggered:', sessionId, modelUrl);
    setCurrentModelUrl(modelUrl);
    setCurrentModelPath(modelUrl);
    setModelType('gaussian');
    
    // Update session status
    setSessions(prev => prev.map(session => 
      session.sessionId === sessionId 
        ? { ...session, status: 'completed', modelUrl }
        : session
    ));
    
    console.log('Model type set to gaussian, URL:', modelUrl);
  };

  // Load demo sessions
  useEffect(() => {
    const demoSessions: ScanSession[] = [
              {
          sessionId: 'demo_session_123',
          patientName: 'John Smith',
          status: 'completed',
          createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
          modelUrl: '/models/elon-musk.glb'
        },
      {
        sessionId: 'demo_session_456',
        patientName: 'Sarah Johnson',
        status: 'processing',
        createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
        progress: 65,
        message: 'Processing Gaussian Splatting...'
      }
    ];
    
    setSessions(demoSessions);
  }, []);

  // Set loading to false after component mounts
  useEffect(() => {
    console.log('Index component mounted');
    setIsLoading(false);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl font-semibold text-gray-700 mb-2">Loading RHINOVATE...</div>
          <div className="text-gray-500">Please wait while the application loads</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="bg-slate-700 text-white px-6 py-3 rounded-lg font-semibold">
              RHINOVATE
            </div>
            <h1 className="text-2xl font-medium text-gray-700">Dashboard</h1>
            {modelType === 'gaussian' && (
              <Badge variant="default" className="bg-gradient-to-r from-purple-500 to-pink-500">
                <Zap className="h-3 w-3 mr-1" />
                Gaussian Splatting
              </Badge>
            )}
          </div>
          <div className="text-gray-400 text-xl font-light">RV</div>
        </div>

        {/* Main Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - 3D Model Viewer */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              {modelType === 'gaussian' && currentModelUrl ? (
                <GaussianModelViewer 
                  modelUrl={currentModelUrl}
                  sessionId={selectedSession?.sessionId}
                  patientName={selectedSession?.patientName}
                  onModelLoaded={() => console.log('Gaussian model loaded')}
                  onModelError={(error) => console.error('Model error:', error)}
                  deformationStrength={deformationStrength}
                />
              ) : (
                <ModelViewer 
                  modelPath={currentModelPath}
                  deformationStrength={deformationStrength} 
                />
              )}
              
              {/* Model Controls - Show for both default and Gaussian models */}
              <ModelControls 
                deformationStrength={deformationStrength}
                onDeformationStrengthChange={handleDeformationStrengthChange}
                onSaveModel={handleSaveModel}
                isModelSaved={isModelSaved}
                modelType={modelType}
              />
            </div>
          </div>

          {/* Right Column - 3D Capture System */}
          <div className="space-y-6">
            {/* Main Action Card */}
            <Card className="border-2 border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-800">
                  <Camera className="h-5 w-5" />
                  3D Face Capture
                </CardTitle>
                <CardDescription className="text-blue-600">
                  Create a new 3D scan session for a patient
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScanCapture onModelReady={handleGaussianModelReady} />
              </CardContent>
            </Card>

            {/* Quick Access Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-1">
                <TabsTrigger value="sessions" className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Recent Sessions
                </TabsTrigger>
              </TabsList>

              <TabsContent value="gaussian-capture" className="space-y-4">
                <ScanCapture onModelReady={handleGaussianModelReady} />
              </TabsContent>

              <TabsContent value="sessions" className="space-y-4">
                {/* Sessions List */}
                {sessions.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Recent Sessions</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {sessions.map((session) => (
                          <div 
                            key={session.sessionId}
                            className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                              selectedSession?.sessionId === session.sessionId 
                                ? 'bg-blue-50 border-blue-200' 
                                : 'hover:bg-gray-50'
                            }`}
                            onClick={() => setSelectedSession(session)}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                                <Zap className="h-4 w-4 text-white" />
                              </div>
                              <div>
                                <div className="font-medium">{session.patientName}</div>
                                <div className="text-sm text-gray-500">
                                  {new Date(session.createdAt).toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                            <Badge 
                              variant={session.status === 'completed' ? 'default' : 'secondary'}
                            >
                              {session.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Selected Session Details */}
                {selectedSession && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Session Details</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium">Patient:</span>
                          <div className="text-gray-600">{selectedSession.patientName}</div>
                        </div>
                        <div>
                          <span className="font-medium">Status:</span>
                          <div className="text-gray-600">{selectedSession.status}</div>
                        </div>
                        <div>
                          <span className="font-medium">Session ID:</span>
                          <div className="text-gray-600 font-mono text-xs">{selectedSession.sessionId}</div>
                        </div>
                        <div>
                          <span className="font-medium">Created:</span>
                          <div className="text-gray-600">
                            {new Date(selectedSession.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      {selectedSession.status === 'completed' && selectedSession.modelUrl && (
                        <div className="pt-4 border-t">
                          <Button 
                            onClick={() => handleGaussianModelReady(selectedSession.sessionId, selectedSession.modelUrl!)}
                            className="w-full"
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Gaussian Splatting Model
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {!selectedSession && sessions.length === 0 && (
                  <Card>
                    <CardContent className="text-center py-8">
                      <Zap className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <div className="text-gray-500">
                        No Gaussian Splatting sessions yet. Create a new capture to get started.
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>


            </Tabs>

            {isModelSaved && (
              <>
                <HealingPreviews isModelSaved={isModelSaved} />
                <AIRecommendations />
              </>
            )}
          </div>
        </div>

        {/* Bottom Section - Patient Info */}
        <div className="mt-6">
          <PatientInfo />
        </div>
      </div>
    </div>
  );
};

export default Index;
