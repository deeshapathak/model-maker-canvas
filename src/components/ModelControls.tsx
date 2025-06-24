import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useState } from "react";
import { Check } from "lucide-react";

interface ModelControlsProps {
  onDeformationStrengthChange?: (strength: number) => void;
  deformationStrength?: number;
  onSaveModel?: () => void;
  isModelSaved?: boolean;
  modelType?: 'default' | 'gaussian';
}

export const ModelControls = ({ 
  onDeformationStrengthChange,
  deformationStrength = 0.1,
  onSaveModel,
  isModelSaved = false,
  modelType = 'default'
}: ModelControlsProps = {}) => {
  const [intensity, setIntensity] = useState([Math.round(deformationStrength * 100)]);
  const [selectedTool, setSelectedTool] = useState("sculpt");
  const [isSaving, setIsSaving] = useState(false);

  const handleIntensityChange = (value: number[]) => {
    setIntensity(value);
    const strength = value[0] / 100;
    onDeformationStrengthChange?.(strength);
  };

  const handleSaveModel = async () => {
    setIsSaving(true);
    // Simulate save process
    await new Promise(resolve => setTimeout(resolve, 1000));
    onSaveModel?.();
    setIsSaving(false);
  };

  return (
    <div className="p-4 border-t bg-white">
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          <Button 
            variant={selectedTool === "select" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedTool("select")}
          >
            Select
          </Button>
          <Button 
            variant={selectedTool === "sculpt" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedTool("sculpt")}
          >
            Sculpt
          </Button>
          <Button 
            variant={selectedTool === "smooth" ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedTool("smooth")}
          >
            Smooth
          </Button>
        </div>
        <Button 
          className={`${isModelSaved ? 'bg-green-500 hover:bg-green-600' : 'bg-blue-500 hover:bg-blue-600'}`}
          onClick={handleSaveModel}
          disabled={isSaving}
        >
          {isSaving ? (
            'Saving...'
          ) : isModelSaved ? (
            <>
              <Check className="h-4 w-4 mr-2" />
              Model Saved
            </>
          ) : (
            'Save Model'
          )}
        </Button>
      </div>
      
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600 w-20">Brush Strength:</span>
          <div className="flex-1">
            <Slider
              value={intensity}
              onValueChange={handleIntensityChange}
              max={100}
              step={1}
              className="w-full"
            />
          </div>
          <span className="text-sm text-gray-600 w-12">{intensity[0]}%</span>
        </div>
        
        <div className="text-xs text-gray-500">
          💡 Click "Sculpt" tool, then click and drag on the {modelType === 'gaussian' ? 'face' : 'nose'} to reshape it. Adjust brush strength to control the effect intensity.
        </div>

        {isModelSaved && (
          <div className="p-2 bg-green-50 border border-green-200 rounded text-xs text-green-700">
            ✅ Model saved successfully! Check the healing previews to see the recovery progression.
          </div>
        )}

        {!isModelSaved && modelType === 'gaussian' && (
          <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
            💡 Use the sculpting tools to edit the Gaussian Splatting model, then click "Save Model" to unlock healing previews and AI surgical recommendations.
          </div>
        )}
      </div>
    </div>
  );
};