import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { normalizeHouse } from './gameLogic.js';

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
    <group ref={groupRef} position={[0.2, -0.48, -2.35]} scale={boss ? 0.78 : 0.72}>
      <mesh>
        <sphereGeometry args={[2.45, 48, 24]} />
        <meshStandardMaterial color={colorA} roughness={0.72} metalness={0.02} transparent opacity={0.34} />
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
    groupRef.current.position.x = 0.72 + Math.sin(state.clock.elapsedTime * 0.72) * 0.08;
    groupRef.current.position.y = -0.14 + Math.sin(state.clock.elapsedTime * 1.7) * 0.08;
    groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.9) * 0.18;
    groupRef.current.scale.setScalar((boss ? 0.42 : 0.36) + hitPulse);
  });

  return (
    <group ref={groupRef} position={[0.72, -0.14, 1.18]}>
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
  const scale = selected ? 0.34 : 0.27;
  const position = useMemo(() => {
    const houseSpots = [
      [-0.82, -0.58, 1.22],
      [-0.32, -0.45, 1.2],
      [0.18, -0.57, 1.23],
      [0.58, -0.4, 1.2],
      [-0.48, 0.1, 1.15],
      [0.38, 0.08, 1.15],
    ];
    return houseSpots[index % houseSpots.length];
  }, [index]);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    const bounce = active === 'eat' ? Math.abs(Math.sin(t * 7.5)) * 0.22 : Math.sin(t * 2.1 + index) * 0.07;
    groupRef.current.position.x = position[0] + Math.sin(t * 0.62 + index) * 0.08;
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

function VoxelBlock({ position, args, color, emissive = null, opacity = 1 }) {
  return (
    <mesh position={position}>
      <boxGeometry args={args} />
      <meshStandardMaterial
        color={color}
        roughness={0.68}
        metalness={0.02}
        emissive={emissive || color}
        emissiveIntensity={emissive ? 0.12 : 0}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  );
}

function Villa3D({ house }) {
  const groupRef = useRef(null);
  const safeHouse = normalizeHouse(house);
  const built = new Set(safeHouse.built);
  const has = (id) => built.has(id);
  const wallColor = has('foundation') ? '#d2a45c' : '#c8d4c6';
  const foundationBlocks = [-1.08, -0.54, 0, 0.54, 1.08];

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.45) * 0.08;
    groupRef.current.position.y = -0.25 + Math.sin(state.clock.elapsedTime * 0.9) * 0.025;
  });

  return (
    <group ref={groupRef} position={[-0.2, -0.2, 0.32]} scale={1.08}>
      <VoxelBlock position={[0, -0.48, 0]} args={[2.9, 0.18, 1.55]} color="#79b84a" />
      <VoxelBlock position={[0, 0.05, 0]} args={[2.08, 1.05, 1.18]} color={wallColor} opacity={has('foundation') ? 1 : 0.64} />
      {foundationBlocks.map((x) => (
        <VoxelBlock key={x} position={[x, -0.38, 0.68]} args={[0.48, 0.22, 0.16]} color={has('foundation') ? '#79b84a' : '#b6cbb1'} />
      ))}
      {[-0.78, -0.26, 0.26, 0.78].map((x) => (
        <VoxelBlock key={`plank-${x}`} position={[x, 0.26, 0.66]} args={[0.42, 0.36, 0.08]} color="#e2bb72" opacity={has('foundation') ? 1 : 0.5} />
      ))}
      {has('secondFloor') ? (
        <VoxelBlock position={[0, 0.78, 0]} args={[1.78, 0.78, 1.04]} color="#c79255" />
      ) : null}
      {has('roof') ? (
        <>
          <VoxelBlock position={[0, 1.05, 0]} args={[2.28, 0.22, 1.34]} color="#d36d55" />
          <VoxelBlock position={[0, 1.26, 0]} args={[1.74, 0.24, 1.18]} color="#b94f45" />
          <VoxelBlock position={[0, 1.48, 0]} args={[1.02, 0.24, 0.96]} color="#9f4a3e" />
        </>
      ) : null}
      {has('frontDoor') ? (
        <VoxelBlock position={[0, -0.2, 0.66]} args={[0.4, 0.66, 0.1]} color="#7b4a24" />
      ) : null}
      {['windowLeft', 'windowRight'].map((id, index) => (
        has(id) ? (
          <VoxelBlock key={id} position={[index === 0 ? -0.62 : 0.62, 0.1, 0.68]} args={[0.34, 0.34, 0.08]} color="#69c7d9" emissive="#69c7d9" />
        ) : null
      ))}
      {has('balcony') ? (
        <VoxelBlock position={[0, 0.56, 0.72]} args={[1.0, 0.14, 0.2]} color="#f4efe4" />
      ) : null}
      {has('chimney') ? (
        <VoxelBlock position={[0.67, 1.54, -0.12]} args={[0.24, 0.58, 0.26]} color="#77675b" />
      ) : null}
      {has('pool') ? (
        <VoxelBlock position={[1.52, -0.39, 0.36]} args={[0.86, 0.08, 0.62]} color="#69c7d9" emissive="#69c7d9" />
      ) : null}
    </group>
  );
}

function CandyWorld({ monster, ownedPets, selectedPetId, stageIndex, boss, house, petAction }) {
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
      <Villa3D house={house} />
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
  house = {},
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
          house={house}
          petAction={petAction}
        />
      </Canvas>
    </div>
  );
}
