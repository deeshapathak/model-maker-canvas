import { useRef, useState, Suspense, useEffect, useMemo } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Mesh, TextureLoader, Vector3, BufferGeometry, Float32BufferAttribute, Raycaster, Vector2, Points, BufferAttribute, Uint8BufferAttribute, MeshStandardMaterial, Material } from "three";
import { API_CONFIG } from "@/config/api";
import { fetchOverlayPack, updateOverlayPositions } from "@/utils/overlay";
import { loadPLY, type PLYData } from "@/utils/plyLoader";
import type { OverlayPack } from "@/types/overlay";

// Fallback component when GLB is loading or fails
const FallbackSphere = ({ onClick, editingArea, deformationStrength }: { 
  onClick: () => void;
  editingArea?: string | null;
  deformationStrength?: number;
}) => {
  const meshRef = useRef<Mesh>(null);
  
  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.1;
    }
  });

  // Apply deformation to the sphere as a test
  const scale = editingArea === 'nose' ? 1 + deformationStrength! * 0.5 : 1;

  return (
    <mesh ref={meshRef} position={[0, 0, 0]} onClick={onClick} scale={[scale, scale, scale]}>
      <sphereGeometry args={[1.2, 64, 64]} />
      <meshStandardMaterial 
        color={editingArea === 'nose' ? "#ff6b6b" : "#F5C99B"}
        roughness={0.6} 
        metalness={0.1}
      />
    </mesh>
  );
};

// 3D Sculpting Brush System
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

// Deformable GLB Model Component with 3D Sculpting
const ElonMuskModel = ({
  onClick,
  modelPath = '/models/elon-musk.glb',
  scale = [1, 1, 1],
  editingArea,
  deformationStrength = 0.1,
  scanId,
  overlayOpacity = 0.8,
  meshOpacity = 1.0
}: {
  onClick: () => void;
  modelPath?: string;
  scale?: [number, number, number];
  editingArea?: string | null;
  deformationStrength?: number;
  scanId?: string | null;
  overlayOpacity?: number;
  meshOpacity?: number;
}) => {
  const meshRef = useRef<Mesh>(null);
  const overlayRef = useRef<Points>(null);
  const plyPointsRef = useRef<Points>(null);
  const overlayPackRef = useRef<OverlayPack | null>(null);
  const overlayPositionsRef = useRef<Float32Array | null>(null);
  const overlayGeometryRef = useRef<BufferGeometry | null>(null);
  const plyGeometryRef = useRef<BufferGeometry | null>(null);
  const originalPositionsRef = useRef<Float32Array | null>(null);
  const [isDeforming, setIsDeforming] = useState(false);
  const [isSculpting, setIsSculpting] = useState(false);
  const [brushPosition, setBrushPosition] = useState<Vector3>(new Vector3());
  const [overlayReady, setOverlayReady] = useState(false);
  const [plyReady, setPlyReady] = useState(false);
  const { camera, gl } = useThree();

  // Use useGLTF directly and let Suspense handle errors
  const scene = useGLTF(modelPath);

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
              console.log('Stored original positions:', originalPositionsRef.current.length);
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

  // 3D Sculpting function - like Photoshop's liquify tool
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
              
              // Apply different sculpting effects based on editing area
              if (editingArea === 'nose') {
                // Nose sculpting - push vertices outward
                const direction = vertexPosition.clone().sub(intersectionPoint).normalize();
                const pushStrength = strength * influence * 0.1;
                
                newPositions[i * 3] = x + direction.x * pushStrength;
                newPositions[i * 3 + 1] = y + direction.y * pushStrength;
                newPositions[i * 3 + 2] = z + direction.z * pushStrength;
              }
              
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

  // Mouse interaction handlers using React Three Fiber events
  const handlePointerDown = (event: any) => {
    if (editingArea === 'nose') {
      event.stopPropagation();
      setIsSculpting(true);
      handlePointerMove(event);
    }
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

  useFrame((state, delta) => {
    if (meshRef.current && !isDeforming && !isSculpting) {
      meshRef.current.rotation.y += delta * 0.1;
    }
  });

  useFrame(() => {
    if (!overlayReady || !overlayPackRef.current || !overlayPositionsRef.current) {
      return;
    }
    const geometry = overlayGeometryRef.current;
    if (!geometry) {
      return;
    }
    let flamePositions: Float32Array | null = null;
    clonedScene?.traverse((child) => {
      if (child instanceof Mesh && child.geometry && !flamePositions) {
        const positions = child.geometry.attributes.position;
        flamePositions = positions?.array as Float32Array;
      }
    });
    if (!flamePositions) {
      return;
    }
    updateOverlayPositions(overlayPackRef.current, flamePositions, overlayPositionsRef.current);
    const attr = geometry.getAttribute("position") as BufferAttribute;
    attr.needsUpdate = true;
  });

  useEffect(() => {
    console.log(`Loading 3D model from: ${modelPath}`);
    console.log('Model scene:', clonedScene);
  }, [modelPath, clonedScene]);

  // Apply mesh opacity to dim the FLAME mesh when overlay is more visible
  useEffect(() => {
    if (!clonedScene) return;

    clonedScene.traverse((child) => {
      if (child instanceof Mesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat: Material) => {
          if (mat instanceof MeshStandardMaterial) {
            mat.transparent = meshOpacity < 1.0;
            mat.opacity = meshOpacity;
            mat.needsUpdate = true;
          }
        });
      }
    });
  }, [clonedScene, meshOpacity]);

  // Load PLY point cloud directly - this is the actual scan data
  useEffect(() => {
    if (!scanId) {
      console.log("PLY: No scanId provided");
      setPlyReady(false);
      return;
    }
    const plyUrl = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_SCAN_PLY(encodeURIComponent(scanId))}`;
    console.log("PLY: Fetching from", plyUrl);
    let cancelled = false;

    loadPLY(plyUrl)
      .then((plyData) => {
        if (cancelled) return;
        console.log("PLY: Loaded successfully", {
          pointCount: plyData.pointCount,
        });

        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new Float32BufferAttribute(plyData.positions, 3));
        const colorAttr = new Uint8BufferAttribute(plyData.colors, 3);
        colorAttr.normalized = true;
        geometry.setAttribute("color", colorAttr);

        // Center the point cloud
        geometry.computeBoundingBox();
        const center = geometry.boundingBox?.getCenter(new Vector3()) || new Vector3();
        geometry.translate(-center.x, -center.y, -center.z);

        plyGeometryRef.current = geometry;
        setPlyReady(true);
        console.log("PLY: Ready to render");
      })
      .catch((err) => {
        console.error("PLY load failed, trying overlay:", err);
        setPlyReady(false);

        // Fallback to overlay system
        const overlayUrl = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_OVERLAY(encodeURIComponent(scanId))}`;
        fetchOverlayPack(overlayUrl)
          .then((pack) => {
            if (cancelled) return;
            console.log("Overlay: Loaded as fallback", { pointCount: pack.points.length / 3 });
            overlayPackRef.current = pack;
            const positions = new Float32Array(pack.points);
            overlayPositionsRef.current = positions;
            const geometry = new BufferGeometry();
            geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
            const colorAttr = new Uint8BufferAttribute(pack.colors, 3);
            colorAttr.normalized = true;
            geometry.setAttribute("color", colorAttr);
            overlayGeometryRef.current = geometry;
            setOverlayReady(true);
          })
          .catch((overlayErr) => {
            console.error("Both PLY and overlay failed:", overlayErr);
          });
      });

    return () => {
      cancelled = true;
    };
  }, [scanId]);

  // If we have PLY data, show ONLY the point cloud (not the FLAME mesh)
  // This gives the user their actual scan appearance
  if (plyReady && plyGeometryRef.current) {
    return (
      <group>
        <points ref={plyPointsRef} geometry={plyGeometryRef.current} scale={10}>
          <pointsMaterial
            size={0.015}
            sizeAttenuation={true}
            vertexColors
            transparent={false}
          />
        </points>
      </group>
    );
  }

  // If model failed to load and no PLY, show fallback
  if (!clonedScene) {
    return (
      <FallbackSphere
        onClick={onClick}
        editingArea={editingArea}
        deformationStrength={deformationStrength}
      />
    );
  }

  // Show FLAME mesh with overlay if available
  return (
    <group>
      <primitive
        object={clonedScene}
        position={[0, 0, 0]}
        scale={scale}
        onClick={onClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />

      {/* Sculpting brush indicator */}
      <SculptingBrush
        position={brushPosition}
        strength={deformationStrength}
        radius={0.1}
        isActive={isSculpting}
      />

      {overlayReady && overlayGeometryRef.current && (
        <points ref={overlayRef} geometry={overlayGeometryRef.current}>
          <pointsMaterial
            size={0.006}
            sizeAttenuation={true}
            vertexColors
            transparent
            opacity={overlayOpacity}
            depthWrite={false}
          />
        </points>
      )}
    </group>
  );
};

interface FaceModelProps {
  modelPath?: string;
  scale?: [number, number, number];
  deformationStrength?: number;
  scanId?: string | null;
  overlayOpacity?: number;
  meshOpacity?: number;
}

export const FaceModel = ({
  modelPath = '/models/elon-musk.glb',
  scale = [1, 1, 1],
  deformationStrength = 0.1,
  scanId = null,
  overlayOpacity = 0.8,
  meshOpacity = 1.0
}: FaceModelProps = {}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingArea, setEditingArea] = useState<string | null>(null);

  const handleClick = (area: string) => {
    setEditingArea(area);
    setIsEditing(true);
    console.log(`Editing area: ${area}`);
  };

  return (
    <group>
      {/* GLB Model with 3D sculpting */}
      <Suspense fallback={<FallbackSphere onClick={() => handleClick('nose')} />}>
        <ElonMuskModel
          onClick={() => handleClick('nose')}
          modelPath={modelPath}
          scale={scale}
          editingArea={editingArea}
          deformationStrength={deformationStrength}
          scanId={scanId}
          overlayOpacity={overlayOpacity}
          meshOpacity={meshOpacity}
        />
      </Suspense>

      {/* Editing indicator */}
      {editingArea && (
        <mesh position={[0, 2, 0]}>
          <boxGeometry args={[2.5, 0.3, 0.1]} />
          <meshStandardMaterial color="#4f46e5" />
        </mesh>
      )}

      {/* Add floating text above the model when editing */}
      {editingArea && (
        <mesh position={[0, 1.8, 0]}>
          <planeGeometry args={[2, 0.2]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.9} />
        </mesh>
      )}
    </group>
  );
};
