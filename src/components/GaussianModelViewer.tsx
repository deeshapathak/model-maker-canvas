import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Stage } from "@react-three/drei";
import { Suspense } from "react";
import { useGLTF } from "@react-three/drei";
import { useRef, useState, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Mesh, Vector3, Float32BufferAttribute, Raycaster, Vector2 } from "three";

interface GaussianModelViewerProps {
  modelUrl: string;
  sessionId?: string;
  patientName?: string;
  onModelLoaded?: () => void;
  onModelError?: (error: string) => void;
  deformationStrength?: number;
}

// 3D Sculpting Brush System - exactly like FaceModel
const SculptingBrush = ({ 
  position, 
  strength, 
  radius = 0.1,
  isActive = false 
}: { 
  position: Vector3;
  strength: number;
  radius?: number;
  isActive?: boolean;
}) => {
  const brushRef = useRef<Mesh>(null);
  
  if (!isActive) return null;

  return (
    <mesh ref={brushRef} position={position.toArray()}>
      <sphereGeometry args={[radius, 16, 16]} />
      <meshStandardMaterial 
        color="#ff0000" 
        transparent 
        opacity={0.3}
        wireframe
      />
    </mesh>
  );
};

// Editable Gaussian Model Component
const EditableGaussianModel = ({ 
  modelUrl, 
  deformationStrength = 0.1 
}: { 
  modelUrl: string;
  deformationStrength?: number;
}) => {
  const meshRef = useRef<Mesh>(null);
  const originalPositionsRef = useRef<Float32Array | null>(null);
  const [isSculpting, setIsSculpting] = useState(false);
  const [brushPosition, setBrushPosition] = useState<Vector3>(new Vector3());
  const { camera, gl } = useThree();

  // Load the GLTF model
  const scene = useGLTF(modelUrl);

  // Clone the scene to avoid modifying the original
  const clonedScene = useMemo(() => {
    if (scene) {
      try {
        const clone = scene.scene.clone();
        // Store original positions for deformation
        clone.traverse((child) => {
          if (child instanceof Mesh && child.geometry) {
            const positions = child.geometry.attributes.position;
            if (positions) {
              originalPositionsRef.current = positions.array.slice() as Float32Array;
            }
          }
        });
        return clone;
      } catch (error) {
        console.error('Failed to clone scene:', error);
        return null;
      }
    }
    return null;
  }, [scene]);

  // 3D Sculpting function - exactly like FaceModel
  const sculptMesh = (intersectionPoint: Vector3, strength: number, radius: number = 0.1) => {
    if (!clonedScene || !originalPositionsRef.current) return;

    clonedScene.traverse((child) => {
      if (child instanceof Mesh && child.geometry) {
        const positions = child.geometry.attributes.position;
        if (positions && originalPositionsRef.current) {
          const newPositions = new Float32Array(originalPositionsRef.current);
          let modified = false;
          
          // Apply sculpting to vertices near the brush
          for (let i = 0; i < positions.count; i++) {
            const x = originalPositionsRef.current[i * 3];
            const y = originalPositionsRef.current[i * 3 + 1];
            const z = originalPositionsRef.current[i * 3 + 2];
            
            const vertexPosition = new Vector3(x, y, z);
            const distance = vertexPosition.distanceTo(intersectionPoint);
            
            // Only affect vertices within brush radius
            if (distance < radius) {
              // Calculate falloff based on distance
              const falloff = 1 - (distance / radius);
              const influence = falloff * falloff; // Smooth falloff
              
              // Apply sculpting - push vertices outward (same as FaceModel)
              const direction = vertexPosition.clone().sub(intersectionPoint).normalize();
              const pushStrength = strength * influence * 0.1; // Same multiplier as FaceModel
              
              newPositions[i * 3] = x + direction.x * pushStrength;
              newPositions[i * 3 + 1] = y + direction.y * pushStrength;
              newPositions[i * 3 + 2] = z + direction.z * pushStrength;
              
              modified = true;
            }
          }
          
          if (modified) {
            // Update geometry with new positions
            child.geometry.setAttribute('position', new Float32BufferAttribute(newPositions, 3));
            child.geometry.computeVertexNormals();
          }
        }
      }
    });
  };

  // Mouse interaction handlers - exactly like FaceModel
  const handlePointerDown = (event: any) => {
    event.stopPropagation();
    setIsSculpting(true);
    handlePointerMove(event);
  };

  const handlePointerMove = (event: any) => {
    if (!isSculpting || !clonedScene) return;

    event.stopPropagation();

    // Get mouse position in normalized device coordinates
    const rect = gl.domElement.getBoundingClientRect();
    const mouse = new Vector2();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Raycast to find intersection point
    const raycaster = new Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObject(clonedScene, true);
    
    if (intersects.length > 0) {
      const intersectionPoint = intersects[0].point;
      setBrushPosition(intersectionPoint);
      sculptMesh(intersectionPoint, deformationStrength, 0.1);
    }
  };

  const handlePointerUp = (event: any) => {
    event.stopPropagation();
    setIsSculpting(false);
  };

  if (!clonedScene) {
    return null;
  }

  return (
    <>
      <primitive 
        object={clonedScene} 
        scale={[1, 1, 1]}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      <SculptingBrush 
        position={brushPosition}
        strength={deformationStrength}
        radius={0.1}
        isActive={isSculpting}
      />
    </>
  );
};

export const GaussianModelViewer = ({ 
  modelUrl, 
  sessionId, 
  patientName,
  onModelLoaded,
  onModelError,
  deformationStrength = 0.1
}: GaussianModelViewerProps) => {
  return (
    <div className="h-96 lg:h-[500px] bg-gray-50 relative">
      {/* Overlay for model editing indicators */}
      <div className="absolute top-4 left-4 z-10">
        <div className="bg-white px-3 py-1 rounded-full text-sm text-gray-600 shadow-sm">
          Click and drag to rotate • Scroll to zoom • Click and drag on model to sculpt
        </div>
      </div>
      
      <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
        <Suspense fallback={null}>
          <Stage environment="city" intensity={0.6}>
            <EditableGaussianModel 
              modelUrl={modelUrl} 
              deformationStrength={deformationStrength}
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
