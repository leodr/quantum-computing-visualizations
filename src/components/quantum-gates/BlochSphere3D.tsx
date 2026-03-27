import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Line, Html } from "@react-three/drei";
import * as THREE from "three";
import { slerp, easeInOutCubic } from "@/lib/quantum";

interface BlochSphere3DProps {
  beforeBloch: [number, number, number];
  afterBloch: [number, number, number];
  progress: number;
}

const SPHERE_COLOR = "#1a3a6a";
const SPHERE_OPACITY = 0.06;
const GRID_OPACITY = 0.12;
const A = 1.25; // axis extent beyond unit sphere

/**
 * Bloch sphere uses Z as the vertical quantization axis (|0⟩ at +Z).
 * Three.js uses Y as "up". This swaps Y↔Z so the Bloch Z axis
 * renders vertically:  (x_bloch, y_bloch, z_bloch) → (x, z, y)
 */
function toScene(b: [number, number, number]): [number, number, number] {
  return [b[0], b[2], b[1]];
}

function createCircle(
  segments: number,
  map: (cos: number, sin: number) => [number, number, number],
): [number, number, number][] {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const t = (i / segments) * Math.PI * 2;
    return map(Math.cos(t), Math.sin(t));
  });
}

// Great circles already in scene (Three.js) coordinates
const equator = createCircle(80, (c, s) => [c, 0, s]); // Bloch XY plane → scene XZ
const meridianXZ = createCircle(80, (c, s) => [c, s, 0]); // Bloch XZ plane → scene XY
const meridianYZ = createCircle(80, (c, s) => [0, s, c]); // Bloch YZ plane → scene YZ

function SphereShell() {
  return (
    <mesh renderOrder={0}>
      <sphereGeometry args={[1, 40, 40]} />
      <meshBasicMaterial
        color={SPHERE_COLOR}
        transparent
        opacity={SPHERE_OPACITY}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function GreatCircles() {
  return (
    <group renderOrder={1}>
      <Line
        points={equator}
        color="#94a3b8"
        lineWidth={0.8}
        transparent
        opacity={GRID_OPACITY}
        dashed
        dashScale={30}
        dashSize={2}
        gapSize={1.5}
      />
      <Line
        points={meridianXZ}
        color="#94a3b8"
        lineWidth={0.8}
        transparent
        opacity={GRID_OPACITY}
      />
      <Line
        points={meridianYZ}
        color="#94a3b8"
        lineWidth={0.8}
        transparent
        opacity={GRID_OPACITY * 0.7}
      />
    </group>
  );
}

function Axes() {
  // Each entry: [from, to, color]  — all in scene coords
  const axes: [[number, number, number], [number, number, number], string][] = [
    [[-A, 0, 0], [A, 0, 0], "#f87171"], // Bloch X (red)
    [[0, -A, 0], [0, A, 0], "#60a5fa"], // Bloch Z → scene Y (blue, vertical)
    [[0, 0, -A], [0, 0, A], "#4ade80"], // Bloch Y → scene Z (green)
  ];

  return (
    <group renderOrder={2}>
      {axes.map(([from, to, color], i) => (
        <Line
          key={i}
          points={[from, to]}
          color={color}
          lineWidth={1}
          transparent
          opacity={0.35}
        />
      ))}
    </group>
  );
}

const labelStyle = (color: string, size = 11): React.CSSProperties => ({
  fontSize: size,
  fontFamily: "ui-monospace, 'Cascadia Code', 'Fira Code', monospace",
  color,
  userSelect: "none",
  pointerEvents: "none",
  textShadow: "0 0 8px rgba(0,0,0,0.8)",
  whiteSpace: "nowrap",
});

function AxisLabels() {
  const P = A + 0.12;
  return (
    <group>
      {/* Bloch Z axis (scene Y) — vertical: |0⟩ top, |1⟩ bottom */}
      <Html position={[0, P, 0]} center>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={labelStyle("#60a5fa", 10)}>z</span>
          <span style={labelStyle("#93c5fd")}> |0⟩</span>
        </span>
      </Html>
      <Html position={[0, -P, 0]} center>
        <span style={labelStyle("#93c5fd")}>|1⟩</span>
      </Html>

      {/* Bloch X axis (scene X): |+⟩ and |−⟩ */}
      <Html position={[P, 0, 0]} center>
        <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <span style={labelStyle("#fca5a5")}>|+⟩</span>
          <span style={labelStyle("#f87171", 9)}>x</span>
        </span>
      </Html>
      <Html position={[-P, 0, 0]} center>
        <span style={labelStyle("#fca5a5")}>|−⟩</span>
      </Html>

      {/* Bloch Y axis (scene Z) */}
      <Html position={[0, 0, P]} center>
        <span style={labelStyle("#86efac", 10)}>y</span>
      </Html>
      <Html position={[0, 0, -P]} center>
        <span style={labelStyle("#86efac", 9)}>−y</span>
      </Html>
    </group>
  );
}

function StateVector({
  position,
  color,
  opacity = 1,
  radius = 0.05,
}: {
  position: [number, number, number];
  color: string;
  opacity?: number;
  radius?: number;
}) {
  const len = Math.sqrt(
    position[0] ** 2 + position[1] ** 2 + position[2] ** 2,
  );
  if (len < 0.001) return null;

  return (
    <group renderOrder={10}>
      <Line
        points={[[0, 0, 0], position]}
        color={color}
        lineWidth={opacity > 0.5 ? 2.5 : 1.2}
        transparent
        opacity={opacity}
      />
      <mesh position={position}>
        <sphereGeometry args={[radius, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={opacity} />
      </mesh>
    </group>
  );
}

function ArcPath({
  from,
  to,
  color,
  opacity,
}: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  opacity: number;
}) {
  const pts = useMemo(() => {
    const n = 64;
    return Array.from({ length: n + 1 }, (_, i) =>
      toScene(slerp(from, to, i / n)),
    );
  }, [from, to]);

  if (pts.length < 2) return null;

  return (
    <Line
      points={pts}
      color={color}
      lineWidth={1}
      transparent
      opacity={opacity}
      dashed
      dashScale={40}
      dashSize={2}
      gapSize={1.5}
    />
  );
}

function Scene({ beforeBloch, afterBloch, progress }: BlochSphere3DProps) {
  const easedT = easeInOutCubic(progress);
  const current = useMemo(
    () => slerp(beforeBloch, afterBloch, easedT),
    [beforeBloch, afterBloch, easedT],
  );

  const samePoint =
    Math.abs(beforeBloch[0] - afterBloch[0]) < 1e-6 &&
    Math.abs(beforeBloch[1] - afterBloch[1]) < 1e-6 &&
    Math.abs(beforeBloch[2] - afterBloch[2]) < 1e-6;

  return (
    <>
      <ambientLight intensity={0.4} />
      <SphereShell />
      <GreatCircles />
      <Axes />
      <AxisLabels />

      {/* Arc path (full before→after in Bloch coords, transformed to scene) */}
      {!samePoint && (
        <ArcPath
          from={beforeBloch}
          to={afterBloch}
          color="#00d4ff"
          opacity={0.2}
        />
      )}

      {/* Ghost: before state */}
      {progress > 0.01 && progress < 0.99 && (
        <StateVector
          position={toScene(beforeBloch)}
          color="#00d4ff"
          opacity={0.2}
          radius={0.035}
        />
      )}

      {/* Ghost: after target */}
      {progress > 0.01 && progress < 0.99 && !samePoint && (
        <StateVector
          position={toScene(afterBloch)}
          color="#00d4ff"
          opacity={0.1}
          radius={0.03}
        />
      )}

      {/* Current animated state */}
      <StateVector
        position={toScene(current)}
        color="#00e5ff"
        opacity={1}
        radius={0.055}
      />

      <OrbitControls
        enableZoom
        enablePan={false}
        minDistance={2.5}
        maxDistance={6}
        enableDamping
        dampingFactor={0.12}
      />
    </>
  );
}

export default function BlochSphere3D(props: BlochSphere3DProps) {
  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [2.5, 1.8, 2.5], fov: 42 }}
        gl={{ antialias: true }}
        style={{ background: "transparent" }}
      >
        <Scene {...props} />
      </Canvas>
    </div>
  );
}
