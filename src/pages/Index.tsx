import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ModelViewer } from "@/components/ModelViewer";
import { ModelControls } from "@/components/ModelControls";
import { HealingPreviews } from "@/components/HealingPreviews";
import { AIRecommendations } from "@/components/AIRecommendations";
import { PatientInfo } from "@/components/PatientInfo";
import { useModelFetch } from "@/hooks/useModelFetch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, RefreshCw, Download, Upload } from "lucide-react";
import { API_CONFIG } from "@/config/api";

const Index = () => {
  const [searchParams] = useSearchParams();
  const [deformationStrength, setDeformationStrength] = useState(0.1);
  const [isModelSaved, setIsModelSaved] = useState(false);
  const [uploadedModelUrl, setUploadedModelUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
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
  const currentModelPath = uploadedModelUrl || modelUrl || '/models/elon-musk.glb';
  const isUsingAPIModel = !!modelUrl;
  const isUsingUploadedModel = !!uploadedModelUrl;

  useEffect(() => {
    return () => {
      if (uploadedModelUrl) {
        URL.revokeObjectURL(uploadedModelUrl);
      }
    };
  }, [uploadedModelUrl]);

  const handleDeformationStrengthChange = (strength: number) => {
    setDeformationStrength(strength);
  };

  const handleSaveModel = () => {
    setIsModelSaved(true);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setUploadError(null);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("ply", file);

      const response = await fetch(
        `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.PLY_TO_GLB}`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "PLY conversion failed.");
      }

      const blob = await response.blob();
      const nextUrl = URL.createObjectURL(blob);
      setUploadedModelUrl((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous);
        }
        return nextUrl;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed.";
      setUploadError(message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
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
            {isUsingUploadedModel && (
              <span className="text-sm text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                Using Uploaded Scan
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

              <div className="p-4 border-b bg-slate-50">
                <Card className="border-slate-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      Upload PLY Scan
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Convert a TrueDepth ASCII PLY to a sculptable GLB mesh
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleUploadClick}
                        disabled={isUploading}
                        size="sm"
                        className="flex-1"
                      >
                        {isUploading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Converting...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 mr-2" />
                            Upload PLY Scan
                          </>
                        )}
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".ply"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                    </div>
                    {uploadError && (
                      <p className="text-xs text-red-600 mt-2">{uploadError}</p>
                    )}
                  </CardContent>
                </Card>
              </div>

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
