import { ModelViewer } from "./ModelViewer";

// Example component showing different ways to use the ModelViewer with custom models
export const ModelExamples = () => {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Model Examples</h2>
      
      {/* Default Elon Musk model */}
      <div>
        <h3 className="text-lg font-medium mb-2">Default Elon Musk Model</h3>
        <ModelViewer />
      </div>

      {/* Custom model path */}
      <div>
        <h3 className="text-lg font-medium mb-2">Custom Model Path</h3>
        <ModelViewer 
          modelPath="/models/custom-elon.glb" 
          scale={[1.2, 1.2, 1.2]}
        />
      </div>

      {/* Different scale */}
      <div>
        <h3 className="text-lg font-medium mb-2">Larger Scale Model</h3>
        <ModelViewer 
          modelPath="/models/elon-musk.glb" 
          scale={[1.5, 1.5, 1.5]}
        />
      </div>

      {/* Smaller scale */}
      <div>
        <h3 className="text-lg font-medium mb-2">Smaller Scale Model</h3>
        <ModelViewer 
          modelPath="/models/elon-musk.glb" 
          scale={[0.8, 0.8, 0.8]}
        />
      </div>
    </div>
  );
}; 