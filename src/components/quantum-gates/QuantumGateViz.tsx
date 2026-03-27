import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  type Complex,
  type QubitState,
  type Matrix2x2,
  complex,
  C_ONE,
  C_ZERO,
  applyGate,
  normalizeState,
  stateToBloch,
  stateFromAngles,
  slerp,
  easeInOutCubic,
  FIXED_GATES,
  ROTATION_GATES,
  PRESET_STATES,
  formatComplex,
  isUnitary,
} from "@/lib/quantum";
import BlochSphere3D from "./BlochSphere3D";

const ANIM_DURATION = 1.2;

function formatAngle(rad: number): string {
  const f = rad / Math.PI;
  if (Math.abs(f) < 0.01) return "0";
  if (Math.abs(f - 0.25) < 0.02) return "π/4";
  if (Math.abs(f - 1 / 3) < 0.02) return "π/3";
  if (Math.abs(f - 0.5) < 0.02) return "π/2";
  if (Math.abs(f - 2 / 3) < 0.02) return "2π/3";
  if (Math.abs(f - 0.75) < 0.02) return "3π/4";
  if (Math.abs(f - 1) < 0.02) return "π";
  if (Math.abs(f - 1.5) < 0.02) return "3π/2";
  if (Math.abs(f - 2) < 0.02) return "2π";
  return `${f.toFixed(2)}π`;
}

function gateColor(key: string): string {
  if (key in FIXED_GATES) return FIXED_GATES[key].color;
  if (key in ROTATION_GATES) return ROTATION_GATES[key].color;
  return "#94a3b8";
}

function gateLabel(key: string): string {
  if (key in FIXED_GATES) return FIXED_GATES[key].label;
  if (key in ROTATION_GATES) return ROTATION_GATES[key].label;
  return "Custom";
}

function gateDescription(key: string): string {
  if (key in FIXED_GATES) return FIXED_GATES[key].description;
  if (key in ROTATION_GATES) return ROTATION_GATES[key].description;
  return "User-defined 2×2 unitary matrix";
}

function gateDisplayName(key: string): string {
  if (key in FIXED_GATES) return FIXED_GATES[key].name;
  if (key in ROTATION_GATES) return ROTATION_GATES[key].name;
  return "U";
}

// ── Sub-components ──────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500 mb-2">
      {children}
    </div>
  );
}

function MatrixDisplay({ matrix }: { matrix: Matrix2x2 }) {
  return (
    <div className="relative px-5 py-2.5 my-1">
      <div className="absolute left-1 top-0 bottom-0 w-[5px] border-l-[1.5px] border-t border-b border-neutral-600/50 rounded-l-[2px]" />
      <div className="absolute right-1 top-0 bottom-0 w-[5px] border-r-[1.5px] border-t border-b border-neutral-600/50 rounded-r-[2px]" />
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 font-mono text-[11px] text-neutral-300 text-center">
        <span>{formatComplex(matrix[0][0], 3)}</span>
        <span>{formatComplex(matrix[0][1], 3)}</span>
        <span>{formatComplex(matrix[1][0], 3)}</span>
        <span>{formatComplex(matrix[1][1], 3)}</span>
      </div>
    </div>
  );
}

function ComplexEntry({
  value,
  onChange,
}: {
  value: Complex;
  onChange: (c: Complex) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <input
        type="number"
        value={value.re}
        onChange={(e) =>
          onChange(complex(parseFloat(e.target.value) || 0, value.im))
        }
        className="w-[52px] h-6 rounded bg-white/5 border border-white/10 px-1 text-center text-[11px] font-mono text-neutral-300 outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20"
        step={0.1}
      />
      <span className="text-[9px] text-neutral-600">+</span>
      <input
        type="number"
        value={value.im}
        onChange={(e) =>
          onChange(complex(value.re, parseFloat(e.target.value) || 0))
        }
        className="w-[52px] h-6 rounded bg-white/5 border border-white/10 px-1 text-center text-[11px] font-mono text-neutral-300 outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20"
        step={0.1}
      />
      <span className="text-[9px] text-neutral-600 italic">i</span>
    </div>
  );
}

function ProbBar({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-mono text-neutral-500 w-10 shrink-0">
        {label}
      </span>
      <div className="flex-1 h-[6px] bg-white/[0.04] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-200"
          style={{
            width: `${value * 100}%`,
            background: `linear-gradient(90deg, #0ea5e9, #06b6d4)`,
            opacity: 0.7 + value * 0.3,
          }}
        />
      </div>
      <span className="text-[10px] font-mono text-neutral-400 w-12 text-right shrink-0">
        {(value * 100).toFixed(1)}%
      </span>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────

export default function QuantumGateViz() {
  const [statePreset, setStatePreset] = useState("|0⟩");
  const [inputState, setInputState] = useState<QubitState>(
    PRESET_STATES["|0⟩"],
  );
  const [customTheta, setCustomTheta] = useState(0);
  const [customPhi, setCustomPhi] = useState(0);

  const [gateKey, setGateKey] = useState("H");
  const [rotAngle, setRotAngle] = useState(Math.PI / 2);
  const [customMatrix, setCustomMatrix] = useState<Matrix2x2>([
    [C_ONE, C_ZERO],
    [C_ZERO, C_ONE],
  ]);

  const [progress, setProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const animRef = useRef(0);
  const lastTRef = useRef(0);

  // ── Custom state from angles ──
  useEffect(() => {
    if (statePreset === "custom") {
      setInputState(stateFromAngles(customTheta, customPhi));
    }
  }, [statePreset, customTheta, customPhi]);

  // ── Computed gate matrix ──
  const gateMatrix = useMemo((): Matrix2x2 => {
    if (gateKey in FIXED_GATES) return FIXED_GATES[gateKey].matrix;
    if (gateKey in ROTATION_GATES)
      return ROTATION_GATES[gateKey].create(rotAngle);
    return customMatrix;
  }, [gateKey, rotAngle, customMatrix]);

  const outputState = useMemo(
    () => applyGate(gateMatrix, inputState),
    [gateMatrix, inputState],
  );
  const beforeBloch = useMemo(() => stateToBloch(inputState), [inputState]);
  const afterBloch = useMemo(() => stateToBloch(outputState), [outputState]);

  const currentBloch = useMemo(
    () => slerp(beforeBloch, afterBloch, easeInOutCubic(progress)),
    [beforeBloch, afterBloch, progress],
  );
  const prob0 = (1 + currentBloch[2]) / 2;
  const prob1 = (1 - currentBloch[2]) / 2;

  const customIsUnitary =
    gateKey === "custom" ? isUnitary(customMatrix) : true;

  // ── Animation loop ──
  useEffect(() => {
    if (!isPlaying) {
      lastTRef.current = 0;
      return;
    }
    const step = (time: number) => {
      if (lastTRef.current === 0) lastTRef.current = time;
      const dt = (time - lastTRef.current) / 1000;
      lastTRef.current = time;
      setProgress((p) => {
        const next = p + dt / ANIM_DURATION;
        if (next >= 1) {
          setIsPlaying(false);
          return 1;
        }
        return next;
      });
      animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animRef.current);
  }, [isPlaying]);

  // ── Handlers ──
  const selectPreset = useCallback((key: string) => {
    setStatePreset(key);
    if (key !== "custom") setInputState(PRESET_STATES[key]);
    setProgress(0);
    setIsPlaying(false);
  }, []);

  const selectGate = useCallback((key: string) => {
    setGateKey(key);
    setProgress(0);
    setIsPlaying(false);
  }, []);

  const play = useCallback(() => {
    if (progress >= 1) setProgress(0);
    setIsPlaying(true);
  }, [progress]);

  const reset = useCallback(() => {
    setIsPlaying(false);
    setProgress(0);
  }, []);

  const applyGateToState = useCallback(() => {
    const newState = normalizeState(outputState);
    setInputState(newState);

    const [x, y, z] = stateToBloch(newState);
    const theta = Math.acos(Math.max(-1, Math.min(1, z)));
    const phi = Math.atan2(y, x);
    setCustomTheta(theta);
    setCustomPhi(phi >= 0 ? phi : phi + 2 * Math.PI);
    setStatePreset("custom");

    setProgress(0);
    setIsPlaying(false);
  }, [outputState]);

  const updateCustomEntry = useCallback(
    (row: 0 | 1, col: 0 | 1, c: Complex) => {
      setCustomMatrix((prev) => {
        const next: Matrix2x2 = [
          [{ ...prev[0][0] }, { ...prev[0][1] }],
          [{ ...prev[1][0] }, { ...prev[1][1] }],
        ];
        next[row][col] = c;
        return next;
      });
    },
    [],
  );

  const isRotGate = gateKey in ROTATION_GATES;

  return (
    <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar ── */}
        <aside className="w-[300px] shrink-0 border-r border-white/[0.06] bg-[#0b1019] overflow-y-auto p-4 space-y-5">
          {/* Input State */}
          <section>
            <SectionLabel>Initial State</SectionLabel>
            <Select value={statePreset} onValueChange={selectPreset}>
              <SelectTrigger className="w-full font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(PRESET_STATES).map((key) => (
                  <SelectItem key={key} value={key}>
                    {key}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Custom (θ, φ)</SelectItem>
              </SelectContent>
            </Select>

            {statePreset === "custom" && (
              <div className="space-y-3 mt-3">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px] text-neutral-500">
                      θ (polar)
                    </span>
                    <span className="text-[10px] font-mono text-neutral-400">
                      {formatAngle(customTheta)}
                    </span>
                  </div>
                  <Slider
                    value={[customTheta]}
                    onValueChange={([v]) => setCustomTheta(v)}
                    min={0}
                    max={Math.PI}
                    step={Math.PI / 40}
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px] text-neutral-500">
                      φ (azimuthal)
                    </span>
                    <span className="text-[10px] font-mono text-neutral-400">
                      {formatAngle(customPhi)}
                    </span>
                  </div>
                  <Slider
                    value={[customPhi]}
                    onValueChange={([v]) => setCustomPhi(v)}
                    min={0}
                    max={Math.PI * 2}
                    step={Math.PI / 40}
                  />
                </div>
              </div>
            )}
          </section>

          {/* Gate Selection */}
          <section>
            <SectionLabel>Quantum Gate</SectionLabel>

            {/* Fixed gates */}
            <div className="grid grid-cols-4 gap-1.5">
              {Object.keys(FIXED_GATES).map((key) => (
                <Tooltip key={key}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => selectGate(key)}
                      className={cn(
                        "h-9 rounded-md text-xs font-mono font-bold transition-all duration-150",
                        gateKey !== key &&
                          "bg-white/[0.04] text-neutral-500 hover:bg-white/[0.07] hover:text-neutral-300",
                      )}
                      style={
                        gateKey === key
                          ? {
                              backgroundColor: `${gateColor(key)}18`,
                              color: gateColor(key),
                              boxShadow: `inset 0 0 0 1px ${gateColor(key)}44, 0 0 10px ${gateColor(key)}10`,
                            }
                          : undefined
                      }
                    >
                      {gateDisplayName(key)}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-52">
                    <p className="font-medium text-xs">{gateLabel(key)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {gateDescription(key)}
                    </p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>

            {/* Rotation gates */}
            <div className="grid grid-cols-3 gap-1.5 mt-1.5">
              {Object.keys(ROTATION_GATES).map((key) => (
                <Tooltip key={key}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => selectGate(key)}
                      className={cn(
                        "h-9 rounded-md text-xs font-mono font-bold transition-all duration-150",
                        gateKey !== key &&
                          "bg-white/[0.04] text-neutral-500 hover:bg-white/[0.07] hover:text-neutral-300",
                      )}
                      style={
                        gateKey === key
                          ? {
                              backgroundColor: `${gateColor(key)}18`,
                              color: gateColor(key),
                              boxShadow: `inset 0 0 0 1px ${gateColor(key)}44, 0 0 10px ${gateColor(key)}10`,
                            }
                          : undefined
                      }
                    >
                      {gateDisplayName(key)}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-52">
                    <p className="font-medium text-xs">{gateLabel(key)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {gateDescription(key)}
                    </p>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>

            {/* Custom */}
            <button
              onClick={() => selectGate("custom")}
              className={cn(
                "mt-1.5 w-full h-8 rounded-md text-xs font-medium transition-all duration-150",
                gateKey === "custom"
                  ? "bg-neutral-500/15 text-neutral-300 ring-1 ring-neutral-500/30"
                  : "bg-white/[0.04] text-neutral-500 hover:bg-white/[0.07] hover:text-neutral-300",
              )}
            >
              Custom Matrix
            </button>

            {/* Rotation angle */}
            {isRotGate && (
              <div className="mt-3">
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] text-neutral-500">
                    Angle θ
                  </span>
                  <span className="text-[10px] font-mono text-neutral-400">
                    {formatAngle(rotAngle)}
                  </span>
                </div>
                <Slider
                  value={[rotAngle]}
                  onValueChange={([v]) => {
                    setRotAngle(v);
                    setProgress(0);
                    setIsPlaying(false);
                  }}
                  min={0}
                  max={Math.PI * 2}
                  step={Math.PI / 40}
                />
              </div>
            )}

            {/* Custom matrix input */}
            {gateKey === "custom" && (
              <div className="mt-3 space-y-2">
                <div className="grid gap-2">
                  <div className="flex items-center gap-2">
                    <ComplexEntry
                      value={customMatrix[0][0]}
                      onChange={(c) => updateCustomEntry(0, 0, c)}
                    />
                    <ComplexEntry
                      value={customMatrix[0][1]}
                      onChange={(c) => updateCustomEntry(0, 1, c)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <ComplexEntry
                      value={customMatrix[1][0]}
                      onChange={(c) => updateCustomEntry(1, 0, c)}
                    />
                    <ComplexEntry
                      value={customMatrix[1][1]}
                      onChange={(c) => updateCustomEntry(1, 1, c)}
                    />
                  </div>
                </div>
                {!customIsUnitary && (
                  <div className="text-[10px] text-amber-400/80 bg-amber-500/10 border border-amber-500/15 rounded px-2 py-1">
                    Matrix is not unitary — results may be non-physical
                  </div>
                )}
              </div>
            )}

            {/* Gate matrix display */}
            <div className="mt-3">
              <div className="text-[10px] text-neutral-600 mb-1">
                Gate matrix
              </div>
              <MatrixDisplay matrix={gateMatrix} />
            </div>
          </section>

          {/* Animation */}
          <section>
            <SectionLabel>Animation</SectionLabel>
            <div className="flex gap-1.5 mb-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={play}
                className="flex-1 font-mono text-[11px]"
              >
                {isPlaying
                  ? "⏸ Pause"
                  : progress >= 0.99
                    ? "↻ Replay"
                    : "▶ Play"}
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" onClick={reset}>
                    ↺
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reset to start</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="default" size="sm" onClick={applyGateToState}>
                    Apply →
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Set output as new input state
                </TooltipContent>
              </Tooltip>
            </div>
            <Slider
              value={[progress]}
              onValueChange={([v]) => {
                setProgress(v);
                setIsPlaying(false);
              }}
              min={0}
              max={1}
              step={0.005}
            />
          </section>

          {/* State Info */}
          <section>
            <SectionLabel>State</SectionLabel>
            <div className="space-y-2.5">
              {/* Input state */}
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-neutral-600 w-7 shrink-0 pt-0.5">
                  In
                </span>
                <div className="font-mono text-[11px] text-neutral-300">
                  <span className="text-neutral-500">α=</span>
                  {formatComplex(normalizeState(inputState)[0])}
                  <span className="text-neutral-600 mx-1.5">·</span>
                  <span className="text-neutral-500">β=</span>
                  {formatComplex(normalizeState(inputState)[1])}
                </div>
              </div>

              {/* Output state */}
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-neutral-600 w-7 shrink-0 pt-0.5">
                  Out
                </span>
                <div className="font-mono text-[11px] text-neutral-300">
                  <span className="text-neutral-500">α=</span>
                  {formatComplex(normalizeState(outputState)[0])}
                  <span className="text-neutral-600 mx-1.5">·</span>
                  <span className="text-neutral-500">β=</span>
                  {formatComplex(normalizeState(outputState)[1])}
                </div>
              </div>

              {/* Probabilities */}
              <div className="pt-1 space-y-1.5">
                <ProbBar label="P(|0⟩)" value={prob0} />
                <ProbBar label="P(|1⟩)" value={prob1} />
              </div>
            </div>
          </section>
        </aside>

        {/* ── Visualization ── */}
        <main
          className="flex-1 relative overflow-hidden"
          style={{
            background:
              "radial-gradient(ellipse at 50% 50%, rgba(14,165,233,0.03) 0%, transparent 65%), #080c14",
          }}
        >
          <BlochSphere3D
            beforeBloch={beforeBloch}
            afterBloch={afterBloch}
            progress={progress}
          />

          {/* Bloch coordinates overlay */}
          <div className="absolute bottom-4 right-4 font-mono text-[10px] text-neutral-500 bg-black/30 backdrop-blur-sm rounded-md px-3 py-2 border border-white/[0.04]">
            <div className="flex gap-4">
              <span>
                x={" "}
                <span className="text-neutral-300">
                  {currentBloch[0].toFixed(3)}
                </span>
              </span>
              <span>
                y={" "}
                <span className="text-neutral-300">
                  {currentBloch[1].toFixed(3)}
                </span>
              </span>
              <span>
                z={" "}
                <span className="text-neutral-300">
                  {currentBloch[2].toFixed(3)}
                </span>
              </span>
            </div>
          </div>

          {/* Active gate badge */}
          <div
            className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-md border bg-black/30 backdrop-blur-sm"
            style={{
              borderColor: `${gateColor(gateKey)}30`,
              color: gateColor(gateKey),
            }}
          >
            <span className="font-mono text-sm font-bold">
              {gateDisplayName(gateKey)}
            </span>
            <span className="text-[10px] opacity-60">{gateLabel(gateKey)}</span>
          </div>
        </main>
    </div>
  );
}
