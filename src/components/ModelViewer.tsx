import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Stage } from "@react-three/drei";
import { FaceModel } from "./FaceModel";
import { Suspense } from "react";

interface ModelViewerProps {
  modelPath?: string;
  scale?: [number, number, number];
  deformationStrength?: number;
  scanId?: string | null;
  overlayOpacity?: number;
  meshOpacity?: number;
}

export const ModelViewer = ({
  modelPath = '/models/elon-musk.glb',
  scale = [1, 1, 1],
  deformationStrength = 0.1,
  scanId = null,
  overlayOpacity = 0.8,
  meshOpacity = 1.0
}: ModelViewerProps = {}) => {
  return (
    <div className="h-96 lg:h-[500px] bg-gray-50 relative">
      {/* Overlay for model editing indicators */}
      <div className="absolute top-4 left-4 z-10">
        <div className="bg-white px-3 py-1 rounded-full text-sm text-gray-600 shadow-sm">
          Click and drag to rotate • Scroll to zoom • Click face areas to reshape
        </div>
      </div>

      <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
        <Suspense fallback={null}>
          <Stage environment="city" intensity={0.6}>
            <FaceModel
              modelPath={modelPath}
              scale={scale}
              deformationStrength={deformationStrength}
              scanId={scanId}
              overlayOpacity={overlayOpacity}
              meshOpacity={meshOpacity}
            />
          </Stage>
          <Environment preset="studio" />
          <OrbitControls 
            enablePan={true} 
            enableZoom={true} 
            enableRotate={true}
            minDistance={0.5}
            maxDistance={20}
            zoomSpeed={1.2}
          />
        </Suspense>
      </Canvas>
    </div>
  );
};
