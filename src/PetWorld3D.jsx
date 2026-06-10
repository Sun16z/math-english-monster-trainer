import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

function makeColor(value, fallback = '#ffffff') {
  try {
    return new THREE.Color(value || fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}

function SpinningCandy({ colorA, colorB, colorC, boss }) {
  const groupRef = useRef(null);

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = state.clock.elapsedTime * 0.18;
    groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.08 - 0.65;
  });

  return (
    <group ref={groupRef} position={[0, -0.7, -1.6]} scale={boss ? 1.18 : 1}>
      <mesh>
        <sphereGeometry args={[2.45, 48, 24]} />
        <meshStandardMaterial color={colorA} roughness={0.62} metalness={0.05} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[2.48, 0.08, 12, 96]} />
        <meshStandardMaterial color={colorB} roughness={0.45} emissive={colorB} emissiveIntensity={0.08} />
      </mesh>
      <mesh rotation={[Math.PI / 2.45, 0.4, 0]}>
        <torusGeometry args={[2.58, 0.045, 10, 96]} />
        <meshStandardMaterial color={colorC} roughness={0.5} emissive={colorC} emissiveIntensity={boss ? 0.18 : 0.08} />
      </mesh>
      {[-1.5, -0.55, 0.55, 1.5].map((x, index) => (
        <mesh key={x} position={[x, 0.55 + Math.sin(index) * 0.12, 1.9 - Math.abs(x) * 0.42]} rotation={[0.4, 0.3 * index, 0.2]}>
          <coneGeometry args={[0.18, 0.62, 5]} />
          <meshStandardMaterial color={index % 2 ? colorB : colorC} roughness={0.38} />
        </mesh>
      ))}
    </group>
  );
}

function FloatingTreat({ index, color }) {
  const ref = useRef(null);
  const phase = index * 0.9;
  const position = useMemo(() => {
    const angle = (index / 8) * Math.PI * 2;
    const radius = 3.2 + (index % 3) * 0.28;
    return [Math.cos(angle) * radius, 1.25 + (index % 2) * 0.34, Math.sin(angle) * 0.9 - 1.2];
  }, [index]);

  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.x = state.clock.elapsedTime * 0.55 + phase;
    ref.current.rotation.y = state.clock.elapsedTime * 0.8 + phase;
    ref.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 1.4 + phase) * 0.18;
  });

  return (
    <mesh ref={ref} position={position}>
      <octahedronGeometry args={[0.14 + (index % 3) * 0.025, 0]} />
      <meshStandardMaterial color={color} roughness={0.25} emissive={color} emissiveIntensity={0.24} />
    </mesh>
  );
}

function Opponent3D({ monster, boss, active }) {
  const groupRef = useRef(null);
  const colorA = makeColor(monster?.colorA, '#ff84b7');
  const colorB = makeColor(monster?.colorB, '#ffffff');
  const colorC = makeColor(monster?.colorC, '#ffd76d');

  useFrame((state) => {
    if (!groupRef.current) return;
    const hitPulse = active === 'poke' || active === 'cheer' ? Math.sin(state.clock.elapsedTime * 18) * 0.09 : 0;
    groupRef.current.position.y = 0.62 + Math.sin(state.clock.elapsedTime * 1.7) * 0.14;
    groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.9) * 0.18;
    groupRef.current.scale.setScalar((boss ? 1.2 : 1) + hitPulse);
  });

  return (
    <group ref={groupRef} position={[1.55, 0.65, 0.3]}>
      <mesh>
        <sphereGeometry args={[0.58, 40, 24]} />
        <meshStandardMaterial color={colorA} roughness={0.5} metalness={0.04} emissive={colorA} emissiveIntensity={boss ? 0.2 : 0.06} />
      </mesh>
      <mesh position={[-0.24, 0.42, 0.02]} rotation={[0.1, 0.1, -0.45]}>
        <coneGeometry args={[0.2, 0.72, 18]} />
        <meshStandardMaterial color={colorB} roughness={0.46} />
      </mesh>
      <mesh position={[0.24, 0.42, 0.02]} rotation={[0.1, -0.1, 0.45]}>
        <coneGeometry args={[0.2, 0.72, 18]} />
        <meshStandardMaterial color={colorB} roughness={0.46} />
      </mesh>
      <mesh position={[0, -0.15, 0.5]}>
        <sphereGeometry args={[0.3, 28, 16]} />
        <meshStandardMaterial color={colorB} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.05, 0.61]}>
        <torusGeometry args={[0.26, 0.025, 8, 36]} />
        <meshStandardMaterial color={colorC} roughness={0.35} emissive={colorC} emissiveIntensity={0.18} />
      </mesh>
    </group>
  );
}

function PetToken3D({ entry, index, selected, active }) {
  const groupRef = useRef(null);
  const base = entry.displayMonster || entry.monster;
  const colorA = makeColor(base?.colorA, '#7ecbff');
  const colorB = makeColor(base?.colorB, '#ffffff');
  const colorC = makeColor(base?.colorC, '#ffd76d');
  const scale = selected ? 0.82 : 0.62;
  const position = useMemo(() => {
    const count = 6;
    const angle = Math.PI * 0.88 + (index / Math.max(1, count - 1)) * Math.PI * 0.78;
    const radius = 2.15 + (index % 2) * 0.18;
    return [Math.cos(angle) * radius - 0.2, -0.12 + (index % 2) * 0.08, Math.sin(angle) * 0.72 + 0.66];
  }, [index]);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    const bounce = active === 'eat' ? Math.abs(Math.sin(t * 7.5)) * 0.22 : Math.sin(t * 2.1 + index) * 0.07;
    groupRef.current.position.y = position[1] + bounce;
    groupRef.current.rotation.y = Math.sin(t * 1.2 + index) * 0.24;
    groupRef.current.scale.setScalar(scale + (selected ? Math.sin(t * 2.6) * 0.025 : 0));
  });

  return (
    <group ref={groupRef} position={position} scale={scale}>
      <mesh>
        <sphereGeometry args={[0.38, 32, 18]} />
        <meshStandardMaterial color={colorA} roughness={0.58} emissive={colorA} emissiveIntensity={selected ? 0.12 : 0.04} />
      </mesh>
      <mesh position={[0, -0.06, 0.34]}>
        <sphereGeometry args={[0.22, 24, 14]} />
        <meshStandardMaterial color={colorB} roughness={0.62} />
      </mesh>
      <mesh position={[-0.18, 0.29, 0]} rotation={[0.25, 0.15, -0.35]}>
        <coneGeometry args={[0.11, 0.42, 14]} />
        <meshStandardMaterial color={colorB} roughness={0.45} />
      </mesh>
      <mesh position={[0.18, 0.29, 0]} rotation={[0.25, -0.15, 0.35]}>
        <coneGeometry args={[0.11, 0.42, 14]} />
        <meshStandardMaterial color={colorB} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.01, 0.47]}>
        <torusGeometry args={[0.12, 0.018, 8, 24]} />
        <meshStandardMaterial color={colorC} roughness={0.35} emissive={colorC} emissiveIntensity={0.16} />
      </mesh>
      {selected ? (
        <mesh position={[0, -0.45, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.52, 0.025, 8, 42]} />
          <meshStandardMaterial color={colorC} roughness={0.3} emissive={colorC} emissiveIntensity={0.28} />
        </mesh>
      ) : null}
    </group>
  );
}

function CandyWorld({ monster, ownedPets, selectedPetId, stageIndex, boss, petAction }) {
  const colorA = makeColor(monster?.colorA, '#69c7d9');
  const colorB = makeColor(monster?.colorB, '#ffffff');
  const colorC = makeColor(monster?.colorC, '#f6c94d');
  const treatColor = stageIndex % 2 ? colorC : colorB;

  return (
    <>
      <ambientLight intensity={0.76} />
      <directionalLight position={[4, 6, 5]} intensity={1.22} />
      <pointLight position={[-3, 2.4, 2.4]} intensity={1.2} color={colorC} />
      <SpinningCandy colorA={colorA} colorB={colorB} colorC={colorC} boss={boss} />
      {Array.from({ length: 8 }, (_, index) => (
        <FloatingTreat key={index} index={index} color={treatColor} />
      ))}
      <Opponent3D monster={monster} boss={boss} active={petAction?.monsterId === monster?.id ? petAction.type : null} />
      {ownedPets.slice(0, 6).map((entry, index) => (
        <PetToken3D
          key={entry.id}
          entry={entry}
          index={index}
          selected={entry.id === selectedPetId}
          active={petAction?.monsterId === entry.id ? petAction.type : null}
        />
      ))}
      <mesh position={[0, -1.22, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[4.2, 64]} />
        <meshStandardMaterial color="#f7fff8" roughness={0.82} transparent opacity={0.72} />
      </mesh>
    </>
  );
}

export default function PetWorld3D({
  monster,
  ownedPets = [],
  selectedPetId = null,
  stageIndex = 0,
  boss = false,
  petAction = null,
}) {
  return (
    <div className="pet-world-3d" aria-hidden="true" data-world-ready="true">
      <Canvas
        camera={{ position: [0, 2.9, 6.7], fov: 42 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
        dpr={[1, 1.8]}
      >
        <CandyWorld
          monster={monster}
          ownedPets={ownedPets}
          selectedPetId={selectedPetId}
          stageIndex={stageIndex}
          boss={boss}
          petAction={petAction}
        />
      </Canvas>
    </div>
  );
}
