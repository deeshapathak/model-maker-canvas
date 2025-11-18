import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ModelViewer } from "@/components/ModelViewer";
import { ModelControls } from "@/components/ModelControls";
import { HealingPreviews } from "@/components/HealingPreviews";
import { AIRecommendations } from "@/components/AIRecommendations";
import { PatientInfo } from "@/components/PatientInfo";
import { useModelFetch } from "@/hooks/useModelFetch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, RefreshCw, Download } from "lucide-react";

const Index = () => {
  const [searchParams] = useSearchParams();
  const [deformationStrength, setDeformationStrength] = useState(0.1);
  const [isModelSaved, setIsModelSaved] = useState(false);
  
  // Get sessionId or scanId from URL parameters (from iOS app)
  const sessionId = searchParams.get('sessionId');
  const scanId = searchParams.get('scanId');
  
  // Fetch model from API
  const {
    modelUrl,
    isLoading,
    error,
    fetchModel,
  } = useModelFetch({
    sessionId: sessionId || undefined,
    scanId: scanId || undefined,
    autoFetch: !!(sessionId || scanId), // Auto-fetch if sessionId or scanId is in URL
  });

  // Use fetched model URL if available, otherwise fallback to Elon Musk model
  const currentModelPath = modelUrl || '/models/elon-musk.glb';
  const isUsingAPIModel = !!modelUrl;

  const handleDeformationStrengthChange = (strength: number) => {
    setDeformationStrength(strength);
  };

  const handleSaveModel = () => {
    setIsModelSaved(true);
  };

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
            {isUsingAPIModel && (
              <span className="text-sm text-green-600 bg-green-50 px-3 py-1 rounded-full">
                Using API Model
              </span>
            )}
          </div>
          <div className="text-gray-400 text-xl font-light">RV</div>
        </div>

        {/* Main Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - 3D Model Viewer */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              {/* API Model Fetch Controls */}
              {!isUsingAPIModel && (
                <div className="p-4 border-b bg-blue-50">
                  <Card className="border-blue-200">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Download className="h-4 w-4" />
                        Load 3D Model from API
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Fetch the latest 3D scan from your iOS app
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-2">
                        <Button
                          onClick={fetchModel}
                          disabled={isLoading}
                          size="sm"
                          className="flex-1"
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Loading...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Fetch Model
                            </>
                          )}
                        </Button>
                      </div>
                      {error && (
                        <p className="text-xs text-red-600 mt-2">{error}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-2">
                        Or add <code className="bg-gray-200 px-1 rounded">?sessionId=xxx</code> or <code className="bg-gray-200 px-1 rounded">?scanId=xxx</code> to URL
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {isLoading && !modelUrl && (
                <div className="h-96 lg:h-[500px] bg-gray-50 flex items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-blue-500" />
                    <p className="text-sm text-gray-600">Loading 3D model from API...</p>
                  </div>
                </div>
              )}

              {!isLoading && (
                <ModelViewer 
                  modelPath={currentModelPath}
                  deformationStrength={deformationStrength} 
                />
              )}
              
              <ModelControls 
                deformationStrength={deformationStrength}
                onDeformationStrengthChange={handleDeformationStrengthChange}
                onSaveModel={handleSaveModel}
                isModelSaved={isModelSaved}
              />
            </div>
          </div>

          {/* Right Column - Healing Previews and AI Recommendations */}
          <div className="space-y-6">
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
