
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useState } from "react";

export const ModelControls = () => {
  const [intensity, setIntensity] = useState([50]);
  const [selectedTool, setSelectedTool] = useState("select");

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
        <Button className="bg-blue-500 hover:bg-blue-600">
          Save Model
        </Button>
      </div>
      
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600 w-20">Intensity:</span>
        <div className="flex-1">
          <Slider
            value={intensity}
            onValueChange={setIntensity}
            max={100}
            step={1}
            className="w-full"
          />
        </div>
        <span className="text-sm text-gray-600 w-12">{intensity[0]}%</span>
      </div>
    </div>
  );
};
