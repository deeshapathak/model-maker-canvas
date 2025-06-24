
import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Mesh } from "three";

export const FaceModel = () => {
  const meshRef = useRef<Mesh>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingArea, setEditingArea] = useState<string | null>(null);

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
      {/* Main face mesh - simplified representation */}
      <mesh 
        ref={meshRef} 
        position={[0, 0, 0]}
        onClick={() => handleClick('face')}
      >
        <sphereGeometry args={[1.2, 32, 32]} />
        <meshStandardMaterial 
          color="#F5C99B" 
          roughness={0.7} 
          metalness={0.1}
        />
      </mesh>

      {/* Nose area - editable */}
      <mesh 
        position={[0, 0, 1.1]} 
        onClick={(e) => {
          e.stopPropagation();
          handleClick('nose');
        }}
      >
        <coneGeometry args={[0.15, 0.4, 8]} />
        <meshStandardMaterial 
          color={editingArea === 'nose' ? "#ff6b6b" : "#F5C99B"} 
          roughness={0.7} 
          metalness={0.1}
        />
      </mesh>

      {/* Left cheek - editable */}
      <mesh 
        position={[-0.7, 0.2, 0.8]} 
        onClick={(e) => {
          e.stopPropagation();
          handleClick('left-cheek');
        }}
      >
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial 
          color={editingArea === 'left-cheek' ? "#ff6b6b" : "#F5C99B"} 
          roughness={0.7} 
          metalness={0.1}
        />
      </mesh>

      {/* Right cheek - editable */}
      <mesh 
        position={[0.7, 0.2, 0.8]} 
        onClick={(e) => {
          e.stopPropagation();
          handleClick('right-cheek');
        }}
      >
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial 
          color={editingArea === 'right-cheek' ? "#ff6b6b" : "#F5C99B"} 
          roughness={0.7} 
          metalness={0.1}
        />
      </mesh>

      {/* Editing indicator */}
      {editingArea && (
        <mesh position={[0, 2, 0]}>
          <boxGeometry args={[2, 0.3, 0.1]} />
          <meshStandardMaterial color="#4f46e5" />
        </mesh>
      )}
    </group>
  );
};
