
import { useRef, useState } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { Mesh, TextureLoader } from "three";

export const FaceModel = () => {
  const meshRef = useRef<Mesh>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingArea, setEditingArea] = useState<string | null>(null);

  // Load the Elon Musk texture
  const texture = useLoader(TextureLoader, '/lovable-uploads/89449555-4eb1-4496-b2b1-d83ab57f7935.png');

  useFrame((state, delta) => {
    if (meshRef.current && !isEditing) {
      meshRef.current.rotation.y += delta * 0.1;
    }
  });

  const handleClick = (area: string) => {
    setEditingArea(area);
    setIsEditing(true);
    console.log(`Editing area: ${area}`);
  };

  return (
    <group>
      {/* Main head mesh with Elon Musk texture */}
      <mesh 
        ref={meshRef} 
        position={[0, 0, 0]}
        onClick={() => handleClick('face')}
      >
        <sphereGeometry args={[1.2, 64, 64]} />
        <meshStandardMaterial 
          map={texture}
          roughness={0.6} 
          metalness={0.1}
        />
      </mesh>

      {/* Nose area - more refined shape */}
      <mesh 
        position={[0, -0.1, 1.15]} 
        onClick={(e) => {
          e.stopPropagation();
          handleClick('nose');
        }}
      >
        <coneGeometry args={[0.12, 0.35, 8]} />
        <meshStandardMaterial 
          color={editingArea === 'nose' ? "#ff6b6b" : "#F5C99B"} 
          roughness={0.6} 
          metalness={0.1}
        />
      </mesh>

      {/* Left cheekbone - more realistic positioning */}
      <mesh 
        position={[-0.6, 0.1, 0.9]} 
        onClick={(e) => {
          e.stopPropagation();
          handleClick('left-cheek');
        }}
      >
        <sphereGeometry args={[0.25, 16, 16]} />
        <meshStandardMaterial 
          color={editingArea === 'left-cheek' ? "#ff6b6b" : "#F5C99B"} 
          roughness={0.6} 
          metalness={0.1}
          transparent
          opacity={0.7}
        />
      </mesh>

      {/* Right cheekbone - more realistic positioning */}
      <mesh 
        position={[0.6, 0.1, 0.9]} 
        onClick={(e) => {
          e.stopPropagation();
          handleClick('right-cheek');
        }}
      >
        <sphereGeometry args={[0.25, 16, 16]} />
        <meshStandardMaterial 
          color={editingArea === 'right-cheek' ? "#ff6b6b" : "#F5C99B"} 
          roughness={0.6} 
          metalness={0.1}
          transparent
          opacity={0.7}
        />
      </mesh>

      {/* Jawline enhancement areas */}
      <mesh 
        position={[-0.8, -0.6, 0.4]} 
        onClick={(e) => {
          e.stopPropagation();
          handleClick('left-jaw');
        }}
      >
        <boxGeometry args={[0.3, 0.4, 0.3]} />
        <meshStandardMaterial 
          color={editingArea === 'left-jaw' ? "#ff6b6b" : "#F5C99B"} 
          roughness={0.6} 
          metalness={0.1}
          transparent
          opacity={0.6}
        />
      </mesh>

      <mesh 
        position={[0.8, -0.6, 0.4]} 
        onClick={(e) => {
          e.stopPropagation();
          handleClick('right-jaw');
        }}
      >
        <boxGeometry args={[0.3, 0.4, 0.3]} />
        <meshStandardMaterial 
          color={editingArea === 'right-jaw' ? "#ff6b6b" : "#F5C99B"} 
          roughness={0.6} 
          metalness={0.1}
          transparent
          opacity={0.6}
        />
      </mesh>

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
