import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ModelViewer } from "@/components/ModelViewer";
import { ModelControls } from "@/components/ModelControls";
import { HealingPreviews } from "@/components/HealingPreviews";
import { AIRecommendations } from "@/components/AIRecommendations";
import { PatientInfo } from "@/components/PatientInfo";
import { Loader2 } from "lucide-react";
import { API_CONFIG } from "@/config/api";

const Index = () => {
  const [searchParams] = useSearchParams();
  const [deformationStrength, setDeformationStrength] = useState(0.1);
  const [isModelSaved, setIsModelSaved] = useState(false);
  const [activeModelUrl, setActiveModelUrl] = useState<string | null>(null);
  const [isLoadingScan, setIsLoadingScan] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanStatus, setScanStatus] = useState<string>("Idle");
  const [qcWarning, setQcWarning] = useState<string | null>(null);
  
  const scanIdFromUrl = searchParams.get('scanId');
  const currentModelPath = activeModelUrl || '/models/elon-musk.glb';
  const isUsingRemoteScan = !!activeModelUrl;
  // The overlay shows the ACTUAL scan colors/geometry from the point cloud
  // Make it always prominent since FLAME mesh can look too template-like
  const overlayOpacity = qcWarning ? 0.98 : 0.95;
  // Always blend the FLAME mesh with some transparency so overlay shows through
  // When QC warnings exist, dim it much more
  const meshOpacity = qcWarning ? 0.1 : 0.6;

  useEffect(() => {
    return () => {
      if (activeModelUrl) {
        URL.revokeObjectURL(activeModelUrl);
      }
    };
  }, [activeModelUrl]);

  useEffect(() => {
    if (scanIdFromUrl) {
      setScanStatus("Waiting for scan...");
      void pollScanStatus(scanIdFromUrl);
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

  const pollScanStatus = async (scanId: string) => {
    const statusUrl = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_SCAN_STATUS(encodeURIComponent(scanId))}`;
    const glbUrl = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_SCAN_GLB(encodeURIComponent(scanId))}`;

    const poll = async () => {
      try {
        const response = await fetch(statusUrl);
        if (!response.ok) {
          const detail = await response.text();
          throw new Error(detail || "Unable to check scan status.");
        }

        const status = await response.json();
        const state = status.state || "processing";
        if (state === "ready") {
          if (status.qc_pass === false) {
            const warnings = Array.isArray(status.warnings) ? status.warnings.join(", ") : "Low confidence fit";
            setQcWarning(`Low confidence fit: ${warnings}`);
          } else {
            setQcWarning(null);
          }
          setScanStatus("Scan ready. Loading model...");
          await loadScanFromEndpoint(glbUrl);
          setScanStatus("Scan loaded.");
          return false;
        }

        if (state === "failed") {
          setScanError(status.message || "Scan processing failed.");
          setScanStatus("Scan failed.");
          setQcWarning(null);
          return false;
        }

        setScanStatus("Processing scan...");
        setQcWarning(null);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to check scan status.";
        setScanError(message);
        setScanStatus("Scan unavailable.");
        setQcWarning(null);
        return false;
      }
    };

    const keepPolling = await poll();
    if (!keepPolling) {
      return;
    }

    const interval = window.setInterval(async () => {
      const shouldContinue = await poll();
      if (!shouldContinue) {
        window.clearInterval(interval);
      }
    }, 5000);
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
                <div className="text-sm text-gray-600">
                  {scanIdFromUrl
                    ? `Scan status: ${scanStatus}`
                    : "Waiting for iOS scan. Open this page with ?scanId=<id>."}
                </div>
                {qcWarning && (
                  <p className="text-xs text-amber-600 mt-2">{qcWarning}</p>
                )}
                {scanError && (
                  <p className="text-xs text-red-600 mt-2">{scanError}</p>
                )}
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
                  scanId={scanIdFromUrl}
                  overlayOpacity={overlayOpacity}
                  meshOpacity={meshOpacity}
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
