import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ModelViewer } from "@/components/ModelViewer";
import { ModelControls } from "@/components/ModelControls";
import { HealingPreviews } from "@/components/HealingPreviews";
import { AIRecommendations } from "@/components/AIRecommendations";
import { PatientInfo } from "@/components/PatientInfo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Link as LinkIcon } from "lucide-react";
import { API_CONFIG } from "@/config/api";

const Index = () => {
  const [searchParams] = useSearchParams();
  const [deformationStrength, setDeformationStrength] = useState(0.1);
  const [isModelSaved, setIsModelSaved] = useState(false);
  const [activeModelUrl, setActiveModelUrl] = useState<string | null>(null);
  const [scanIdInput, setScanIdInput] = useState("");
  const [isLoadingScan, setIsLoadingScan] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  
  const scanIdFromUrl = searchParams.get('scanId');
  const currentModelPath = activeModelUrl || '/models/elon-musk.glb';
  const isUsingRemoteScan = !!activeModelUrl;

  useEffect(() => {
    return () => {
      if (activeModelUrl) {
        URL.revokeObjectURL(activeModelUrl);
      }
    };
  }, [activeModelUrl]);

  useEffect(() => {
    if (scanIdFromUrl) {
      setScanIdInput(scanIdFromUrl);
      void loadScanById(scanIdFromUrl);
    }
  }, [scanIdFromUrl]);

  const handleDeformationStrengthChange = (strength: number) => {
    setDeformationStrength(strength);
  };

  const handleSaveModel = () => {
    setIsModelSaved(true);
  };

  const loadScanFromEndpoint = async (endpoint: string) => {
    setScanError(null);
    setIsLoadingScan(true);

    try {
      const response = await fetch(endpoint);
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || "Unable to load scan.");
      }

      const blob = await response.blob();
      const nextUrl = URL.createObjectURL(blob);
      setActiveModelUrl((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous);
        }
        return nextUrl;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load scan.";
      setScanError(message);
    } finally {
      setIsLoadingScan(false);
    }
  };

  const loadLatestScan = async () => {
    await loadScanFromEndpoint(
      `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_LATEST_SCAN_GLB}`
    );
  };

  const loadScanById = async (scanId: string) => {
    if (!scanId) {
      setScanError("Enter a scan ID first.");
      return;
    }

    await loadScanFromEndpoint(
      `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_SCAN_GLB(encodeURIComponent(scanId))}`
    );
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
            {isUsingRemoteScan && (
              <span className="text-sm text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                Using Live Scan
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
              <div className="p-4 border-b bg-slate-50">
                <Card className="border-slate-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <LinkIcon className="h-4 w-4" />
                      Connect iOS Scan
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Your iOS app uploads scans to the backend and returns a scan ID. Paste it below,
                      or load the latest scan.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-3">
                      <div className="flex gap-2">
                        <input
                          value={scanIdInput}
                          onChange={(event) => setScanIdInput(event.target.value)}
                          placeholder="Scan ID (e.g. 8a2f...)"
                          className="flex-1 rounded-md border border-gray-200 px-3 py-2 text-sm"
                        />
                        <Button
                          onClick={() => loadScanById(scanIdInput)}
                          disabled={isLoadingScan}
                          size="sm"
                        >
                          Load
                        </Button>
                      </div>
                      <Button
                        onClick={loadLatestScan}
                        disabled={isLoadingScan}
                        size="sm"
                        className="w-full"
                      >
                        {isLoadingScan ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Loading scan...
                          </>
                        ) : (
                          "Load Latest Scan"
                        )}
                      </Button>
                      {scanError && (
                        <p className="text-xs text-red-600">{scanError}</p>
                      )}
                      <p className="text-xs text-gray-500">
                        Tip: open <code className="bg-gray-200 px-1 rounded">?scanId=&lt;id&gt;</code> to auto-load.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {isLoadingScan ? (
                <div className="h-96 lg:h-[500px] bg-gray-50 flex items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-blue-500" />
                    <p className="text-sm text-gray-600">Loading scan...</p>
                  </div>
                </div>
              ) : (
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
