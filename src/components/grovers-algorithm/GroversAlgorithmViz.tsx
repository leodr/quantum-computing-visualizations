import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Line, Html } from "@react-three/drei";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ── Constants ────────────────────────────────────────────

const N_QUBITS = 4;
const N_STATES = 1 << N_QUBITS;
const N_ITERATIONS = 3;
const ANIM_MS = 800;

// ── Complex helpers ──────────────────────────────────────

interface C {
  re: number;
  im: number;
}

type SV = C[];

const cMul = (a: C, b: C): C => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});
const cConj = (a: C): C => ({ re: a.re, im: -a.im });
const cAbs2 = (a: C): number => a.re * a.re + a.im * a.im;

// ── Grover simulation ────────────────────────────────────

function applyHAll(sv: SV): SV {
  const out = sv.map((v) => ({ ...v }));
  const S = 1 / Math.sqrt(2);
  for (let q = 0; q < N_QUBITS; q++) {
    const bit = 1 << q;
    const snap = out.map((v) => ({ ...v }));
    for (let i = 0; i < N_STATES; i++) {
      if ((i & bit) === 0) {
        const j = i | bit;
        out[i] = {
          re: S * (snap[i].re + snap[j].re),
          im: S * (snap[i].im + snap[j].im),
        };
        out[j] = {
          re: S * (snap[i].re - snap[j].re),
          im: S * (snap[i].im - snap[j].im),
        };
      }
    }
  }
  return out;
}

function applyOracle(sv: SV, t: number): SV {
  const out = sv.map((v) => ({ ...v }));
  out[t] = { re: -out[t].re, im: -out[t].im };
  return out;
}

function applyDiffusion(sv: SV): SV {
  let sR = 0,
    sI = 0;
  for (const a of sv) {
    sR += a.re;
    sI += a.im;
  }
  const mR = sR / N_STATES;
  const mI = sI / N_STATES;
  return sv.map((a) => ({ re: 2 * mR - a.re, im: 2 * mI - a.im }));
}

function blochForQubit(sv: SV, q: number): [number, number, number] {
  const bit = 1 << q;
  let r00 = 0,
    r11 = 0,
    r01r = 0,
    r01i = 0;
  for (let i = 0; i < N_STATES; i++) {
    if ((i & bit) === 0) {
      const j = i | bit;
      r00 += cAbs2(sv[i]);
      r11 += cAbs2(sv[j]);
      const p = cMul(sv[i], cConj(sv[j]));
      r01r += p.re;
      r01i += p.im;
    }
  }
  return [2 * r01r, -2 * r01i, r00 - r11];
}

function toBin(n: number): string {
  return n.toString(2).padStart(N_QUBITS, "0");
}

// ── Step definitions ─────────────────────────────────────

interface Step {
  label: string;
  tag: string;
  desc: string;
  sv: SV;
  bloch: [number, number, number][];
  iterGroup?: number;
}

function simulate(target: number): Step[] {
  const steps: Step[] = [];
  const tb = toBin(target);
  const bv = (sv: SV) =>
    Array.from({ length: N_QUBITS }, (_, q) => blochForQubit(sv, q));

  let sv: SV = Array.from({ length: N_STATES }, (_, i) =>
    i === 0 ? { re: 1, im: 0 } : { re: 0, im: 0 },
  );
  steps.push({
    label: "Initialization",
    tag: "|0⟩⊗4",
    desc: "All 4 qubits start in |0⟩. Each Bloch vector points to the north pole.",
    sv,
    bloch: bv(sv),
  });

  sv = applyHAll(sv);
  steps.push({
    label: "Hadamard H⊗4",
    tag: "H⊗4",
    desc: `Hadamard gates create a uniform superposition of all ${N_STATES} states. Each qubit is now in |+⟩, on the equator of its Bloch sphere. Every state has equal probability 1/${N_STATES}.`,
    sv,
    bloch: bv(sv),
  });

  for (let it = 1; it <= N_ITERATIONS; it++) {
    sv = applyOracle(sv, target);
    steps.push({
      label: `Oracle (Iter ${it})`,
      tag: "O",
      desc: `The oracle flips the phase of |${tb}⟩. Its amplitude becomes negative while all others stay positive. Probabilities are unchanged — the shift is purely in phase.`,
      sv,
      bloch: bv(sv),
      iterGroup: it,
    });

    sv = applyDiffusion(sv);
    const p = cAbs2(sv[target]);
    steps.push({
      label: `Diffusion (Iter ${it})`,
      tag: "D",
      desc: `Inversion about the mean amplifies the marked state. After iteration ${it}, P(|${tb}⟩) ≈ ${(p * 100).toFixed(1)}%. Qubit Bloch vectors gradually align with the target.`,
      sv,
      bloch: bv(sv),
      iterGroup: it,
    });
  }

  return steps;
}

// ── Interpolation ────────────────────────────────────────

function lerpSV(a: SV, b: SV, t: number): SV {
  const r = a.map((ca, i) => ({
    re: ca.re + (b[i].re - ca.re) * t,
    im: ca.im + (b[i].im - ca.im) * t,
  }));
  let n2 = 0;
  for (const v of r) n2 += v.re * v.re + v.im * v.im;
  const n = Math.sqrt(n2);
  if (n < 1e-12) return r;
  return r.map((v) => ({ re: v.re / n, im: v.im / n }));
}

const ease = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

// ── Mini Bloch Sphere (R3F) ─────────────────────────────

function toScene(b: [number, number, number]): [number, number, number] {
  return [b[0], b[2], b[1]];
}

function makeCircle(
  n: number,
  fn: (c: number, s: number) => [number, number, number],
) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return fn(Math.cos(a), Math.sin(a));
  });
}

const EQ = makeCircle(64, (c, s) => [c, 0, s]);
const MXZ = makeCircle(64, (c, s) => [c, s, 0]);
const MYZ = makeCircle(64, (c, s) => [0, s, c]);
const AX = 1.15;

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 9,
  fontFamily: "ui-monospace, 'Cascadia Code', 'Fira Code', monospace",
  userSelect: "none",
  pointerEvents: "none",
  textShadow: "0 0 6px rgba(0,0,0,0.9)",
  whiteSpace: "nowrap",
};

const AXES: [[number, number, number], [number, number, number], string][] = [
  [[-AX, 0, 0], [AX, 0, 0], "#f87171"],
  [[0, -AX, 0], [0, AX, 0], "#60a5fa"],
  [[0, 0, -AX], [0, 0, AX], "#4ade80"],
];

// Equal superposition |+⟩ in scene coords: Bloch (1,0,0) → scene (1,0,0)
const SUPERPOSITION_POS = toScene([1, 0, 0]);

interface CamSync {
  px: number; py: number; pz: number;
  tx: number; ty: number; tz: number;
  source: number;
  gen: number;
}

function BlochScene({
  bloch,
  color,
  targetBit,
  sync,
  idx,
}: {
  bloch: [number, number, number];
  color: string;
  targetBit: number;
  sync: React.MutableRefObject<CamSync>;
  idx: number;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);
  const localGen = useRef(0);
  const isSyncing = useRef(false);

  useFrame(({ camera }) => {
    const s = sync.current;
    if (s.gen !== localGen.current && s.source !== idx) {
      isSyncing.current = true;
      camera.position.set(s.px, s.py, s.pz);
      const c = controlsRef.current;
      if (c) {
        c.target.set(s.tx, s.ty, s.tz);
        c.update();
      }
      localGen.current = s.gen;
      isSyncing.current = false;
    }
  });

  const handleChange = useCallback(() => {
    if (isSyncing.current) return;
    const c = controlsRef.current;
    if (!c) return;
    const s = sync.current;
    s.px = c.object.position.x;
    s.py = c.object.position.y;
    s.pz = c.object.position.z;
    s.tx = c.target.x;
    s.ty = c.target.y;
    s.tz = c.target.z;
    s.source = idx;
    s.gen++;
  }, [sync, idx]);

  const sp = toScene(bloch);
  const len = Math.sqrt(sp[0] ** 2 + sp[1] ** 2 + sp[2] ** 2);

  const optimalBloch: [number, number, number] =
    targetBit === 0 ? [0, 0, 1] : [0, 0, -1];
  const optimalPos = toScene(optimalBloch);

  return (
    <>
      <ambientLight intensity={0.4} />

      <mesh>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial
          color="#1a3a6a"
          transparent
          opacity={0.06}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      <Line
        points={EQ}
        color="#94a3b8"
        lineWidth={0.6}
        transparent
        opacity={0.1}
        dashed
        dashScale={30}
        dashSize={2}
        gapSize={1.5}
      />
      <Line
        points={MXZ}
        color="#94a3b8"
        lineWidth={0.6}
        transparent
        opacity={0.08}
      />
      <Line
        points={MYZ}
        color="#94a3b8"
        lineWidth={0.6}
        transparent
        opacity={0.06}
      />

      {AXES.map(([f, t, c], i) => (
        <Line
          key={i}
          points={[f, t]}
          color={c}
          lineWidth={0.8}
          transparent
          opacity={0.25}
        />
      ))}

      <Html position={[0, AX + 0.15, 0]} center>
        <span style={{ ...LABEL_STYLE, color: "#93c5fd" }}>|0⟩</span>
      </Html>
      <Html position={[0, -AX - 0.15, 0]} center>
        <span style={{ ...LABEL_STYLE, color: "#93c5fd" }}>|1⟩</span>
      </Html>

      {/* Reference: optimal/target state (s) */}
      <group renderOrder={5}>
        <mesh position={optimalPos}>
          <sphereGeometry args={[0.045, 12, 12]} />
          <meshBasicMaterial color="#f59e0b" transparent opacity={0.6} />
        </mesh>
        <Html
          position={[
            optimalPos[0] + 0.14,
            optimalPos[1] + 0.1,
            optimalPos[2],
          ]}
          center
        >
          <span
            style={{
              ...LABEL_STYLE,
              fontSize: 8,
              color: "#f59e0b",
              fontWeight: 600,
            }}
          >
            s
          </span>
        </Html>
      </group>

      {/* Reference: equal superposition (E) — |+⟩ */}
      <group renderOrder={5}>
        <mesh position={SUPERPOSITION_POS}>
          <sphereGeometry args={[0.045, 12, 12]} />
          <meshBasicMaterial color="#a78bfa" transparent opacity={0.6} />
        </mesh>
        <Html
          position={[
            SUPERPOSITION_POS[0] + 0.14,
            SUPERPOSITION_POS[1] + 0.1,
            SUPERPOSITION_POS[2],
          ]}
          center
        >
          <span
            style={{
              ...LABEL_STYLE,
              fontSize: 8,
              color: "#a78bfa",
              fontWeight: 600,
            }}
          >
            E
          </span>
        </Html>
      </group>

      {/* Current qubit state vector */}
      {len > 0.01 && (
        <group renderOrder={10}>
          <Line
            points={[[0, 0, 0], sp]}
            color={color}
            lineWidth={2.5}
            transparent
            opacity={0.9}
          />
          <mesh position={sp}>
            <sphereGeometry args={[0.065, 14, 14]} />
            <meshBasicMaterial color={color} />
          </mesh>
        </group>
      )}

      <mesh>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshBasicMaterial color="white" transparent opacity={0.3} />
      </mesh>

      <OrbitControls
        ref={controlsRef}
        onChange={handleChange}
        enableZoom
        enablePan={false}
        minDistance={2}
        maxDistance={6}
      />
    </>
  );
}

const MINI_CAM = {
  position: [2.2, 1.6, 2.2] as [number, number, number],
  fov: 42,
};

// ── Amplitude Chart (SVG) ────────────────────────────────

function AmpChart({ sv, target }: { sv: SV; target: number }) {
  const vw = 140;
  const vh = 560;
  const ml = 38,
    mr = 8,
    mt = 4,
    mb = 4;
  const cw = vw - ml - mr;
  const ch = vh - mt - mb;
  const bh = ch / N_STATES;
  const bp = bh * 0.18;
  const mid = ml + cw / 2;

  const amps = sv.map((a) => a.re);
  const maxA = Math.max(0.3, ...amps.map(Math.abs));
  const sc = (cw / 2) / maxA;

  return (
    <svg
      viewBox={`0 0 ${vw} ${vh}`}
      className="w-full h-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Zero line (vertical center) */}
      <line
        x1={mid}
        y1={mt}
        x2={mid}
        y2={vh - mb}
        stroke="rgba(255,255,255,0.1)"
        strokeWidth={1}
      />

      {/* Uniform amplitude reference */}
      <line
        x1={mid + (1 / 4) * sc}
        y1={mt}
        x2={mid + (1 / 4) * sc}
        y2={vh - mb}
        stroke="rgba(255,255,255,0.05)"
        strokeWidth={1}
        strokeDasharray="3 3"
      />

      {amps.map((amp, i) => {
        const y = mt + i * bh + bp / 2;
        const h = bh - bp;
        const w = Math.abs(amp) * sc;
        const x = amp >= 0 ? mid : mid - w;
        const isT = i === target;

        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={Math.max(0.5, w)}
              height={h}
              fill={isT ? "#0ea5e9" : "#64748b"}
              opacity={isT ? 0.85 : 0.35}
              rx={1}
            />
            <text
              x={ml - 4}
              y={y + h / 2 + 3}
              fill={isT ? "#0ea5e9" : "rgba(255,255,255,0.22)"}
              fontSize={6.5}
              fontFamily="monospace"
              textAnchor="end"
              fontWeight={isT ? 600 : 400}
            >
              {toBin(i)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── UI helpers ───────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500 mb-2">
      {children}
    </div>
  );
}

// ── Main component ───────────────────────────────────────

const Q_COLORS = ["#00e5ff", "#f472b6", "#facc15", "#4ade80"];

export default function GroversAlgorithmViz() {
  const [target, setTarget] = useState(5);
  const [step, setStep] = useState(0);
  const [prog, setProg] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const rafRef = useRef(0);
  const tRef = useRef(0);
  const camSync = useRef<CamSync>({
    px: 2.2, py: 1.6, pz: 2.2,
    tx: 0, ty: 0, tz: 0,
    source: -1,
    gen: 0,
  });

  const steps = useMemo(() => simulate(target), [target]);

  const dispSV = useMemo(() => {
    if (step === 0 || prog >= 1) return steps[step].sv;
    return lerpSV(steps[step - 1].sv, steps[step].sv, ease(prog));
  }, [steps, step, prog]);

  const dispBloch = useMemo(
    () => Array.from({ length: N_QUBITS }, (_, q) => blochForQubit(dispSV, q)),
    [dispSV],
  );

  const targetProb = cAbs2(dispSV[target]);

  // Animation loop
  useEffect(() => {
    if (!playing) {
      tRef.current = 0;
      return;
    }
    const tick = (ts: number) => {
      if (tRef.current === 0) tRef.current = ts;
      const dt = (ts - tRef.current) / ANIM_MS;
      tRef.current = ts;
      setProg((p) => {
        const n = p + dt;
        if (n >= 1) {
          setPlaying(false);
          return 1;
        }
        return n;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing]);

  // Auto-advance to next step
  useEffect(() => {
    if (!autoPlay || playing) return;
    if (prog >= 1 && step < steps.length - 1) {
      const timer = setTimeout(() => {
        setStep((s) => s + 1);
        setProg(0);
        setPlaying(true);
      }, 350);
      return () => clearTimeout(timer);
    }
    if (step >= steps.length - 1 && prog >= 1) setAutoPlay(false);
  }, [autoPlay, playing, prog, step, steps.length]);

  const goTo = useCallback(
    (i: number) => {
      setStep(i);
      setProg(1);
      setPlaying(false);
      setAutoPlay(false);
    },
    [],
  );

  const fwd = useCallback(() => {
    if (step >= steps.length - 1) return;
    setStep(step + 1);
    setProg(0);
    setPlaying(true);
    setAutoPlay(false);
  }, [step, steps.length]);

  const back = useCallback(() => {
    if (step <= 0) return;
    setStep(step - 1);
    setProg(1);
    setPlaying(false);
    setAutoPlay(false);
  }, [step]);

  const playAllSteps = useCallback(() => {
    setStep(1);
    setProg(0);
    setPlaying(true);
    setAutoPlay(true);
  }, []);

  const resetViz = useCallback(() => {
    setStep(0);
    setProg(1);
    setPlaying(false);
    setAutoPlay(false);
  }, []);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-[300px] shrink-0 border-r border-white/[0.06] bg-[#0b1019] overflow-y-auto p-4 space-y-5">
        <section>
          <SectionLabel>Target State (Oracle)</SectionLabel>
          <Select
            value={String(target)}
            onValueChange={(v) => {
              setTarget(Number(v));
              setStep(0);
              setProg(1);
              setPlaying(false);
              setAutoPlay(false);
            }}
          >
            <SelectTrigger className="w-full font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: N_STATES }, (_, i) => (
                <SelectItem key={i} value={String(i)}>
                  |{toBin(i)}⟩
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="mt-1.5 text-[10px] text-neutral-600">
            The state the oracle marks for amplification.
          </div>
        </section>

        <section>
          <SectionLabel>Algorithm Steps</SectionLabel>
          <div className="space-y-0.5">
            {steps.map((s, i) => {
              const showGroup =
                s.iterGroup !== undefined &&
                (i < 2 || steps[i - 1].iterGroup !== s.iterGroup);

              return (
                <div key={i}>
                  {showGroup && (
                    <div className="text-[9px] uppercase tracking-widest text-neutral-700 mt-2.5 mb-1 px-2">
                      Iteration {s.iterGroup}
                    </div>
                  )}
                  <button
                    onClick={() => goTo(i)}
                    className={cn(
                      "w-full text-left px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all",
                      step === i
                        ? "bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/20"
                        : i <= step
                          ? "text-neutral-400 hover:bg-white/[0.04]"
                          : "text-neutral-600 hover:bg-white/[0.04]",
                    )}
                  >
                    <span className="font-mono text-[10px] mr-2 opacity-40">
                      {i}
                    </span>
                    {s.label}
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <SectionLabel>Controls</SectionLabel>
          <div className="flex gap-1.5 mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={back}
              disabled={step <= 0}
            >
              ←
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fwd}
              disabled={step >= steps.length - 1}
              className="flex-1 font-mono text-[11px]"
            >
              Step →
            </Button>
            <Button variant="ghost" size="sm" onClick={resetViz}>
              ↺
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={autoPlay ? resetViz : playAllSteps}
            className="w-full font-mono text-[11px]"
          >
            {autoPlay ? "■ Stop" : "▶ Play All"}
          </Button>
        </section>

        <section>
          <SectionLabel>Current Step</SectionLabel>
          <div className="text-[11px] text-neutral-400 leading-relaxed bg-white/[0.02] border border-white/[0.06] rounded-lg p-3">
            <div className="font-medium text-neutral-300 mb-1">
              {steps[step].label}
            </div>
            {steps[step].desc}
          </div>
        </section>

        <section>
          <SectionLabel>Target Probability</SectionLabel>
          <div className="text-center py-1">
            <div className="text-3xl font-mono font-bold text-cyan-400">
              {(targetProb * 100).toFixed(1)}%
            </div>
            <div className="text-[10px] text-neutral-600 mt-0.5">
              P(|{toBin(target)}⟩)
            </div>
          </div>
        </section>

        <section>
          <SectionLabel>About</SectionLabel>
          <div className="text-[10px] text-neutral-600 leading-relaxed space-y-1.5">
            <p>
              Grover's algorithm finds a marked item among N unsorted entries in
              O(√N) queries — a quadratic speedup over classical search.
            </p>
            <p>
              For {N_QUBITS} qubits ({N_STATES} states), {N_ITERATIONS}{" "}
              iterations yield ~96% success probability.
            </p>
            <p>
              Each Bloch sphere shows the reduced state of one qubit. Vectors
              shorter than the sphere radius indicate entanglement with the
              other qubits.
            </p>
          </div>
        </section>
      </aside>

      {/* ── Main ── */}
      <main
        className="flex-1 flex overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(14,165,233,0.03) 0%, transparent 65%), #080c14",
        }}
      >
        {/* Center: badge + Bloch spheres */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Badge */}
          <div className="shrink-0 px-4 pt-2.5 pb-1">
            <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-md border border-cyan-500/20 bg-black/30 backdrop-blur-sm">
              <span className="font-mono text-sm font-bold text-cyan-400">
                {steps[step].tag}
              </span>
              <span className="text-[10px] text-neutral-500">
                {steps[step].label}
              </span>
              {step > 0 && prog < 1 && (
                <div className="w-12 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-500/60 rounded-full"
                    style={{ width: `${prog * 100}%` }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Bloch spheres – 2×2 grid */}
          <div className="flex-1 grid grid-cols-2 grid-rows-2 px-3 gap-1 min-h-0">
            {Array.from({ length: N_QUBITS }, (_, q) => {
              const tBit = (target >> q) & 1;
              return (
                <div
                  key={q}
                  className="flex flex-col items-center min-w-0 min-h-0"
                >
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className="text-[11px] font-mono font-semibold"
                      style={{ color: Q_COLORS[q] }}
                    >
                      q{q}
                    </span>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/[0.05] text-neutral-500">
                      →|{tBit}⟩
                    </span>
                  </div>
                  <div className="flex-1 w-full min-h-0">
                    <Canvas
                      camera={MINI_CAM}
                      gl={{ antialias: true }}
                      style={{ background: "transparent" }}
                    >
                      <BlochScene bloch={dispBloch[q]} color={Q_COLORS[q]} targetBit={(target >> q) & 1} sync={camSync} idx={q} />
                    </Canvas>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right sidebar: amplitude chart */}
        <div className="w-[160px] shrink-0 border-l border-white/[0.06] bg-[#0b1019]/60 flex flex-col overflow-hidden py-3 px-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500 mb-1 px-1 shrink-0">
            Amplitudes
          </div>
          <div className="flex-1 min-h-0">
            <AmpChart sv={dispSV} target={target} />
          </div>
        </div>
      </main>
    </div>
  );
}
