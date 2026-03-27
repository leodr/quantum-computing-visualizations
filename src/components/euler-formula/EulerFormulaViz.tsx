import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

const TAU = 2 * Math.PI;

function formatAngleFraction(rad: number): string {
  const normalized = ((rad % TAU) + TAU) % TAU;
  const f = normalized / Math.PI;
  if (f < 0.01) return "0";
  if (Math.abs(f - 0.25) < 0.02) return "π/4";
  if (Math.abs(f - 1 / 3) < 0.02) return "π/3";
  if (Math.abs(f - 0.5) < 0.02) return "π/2";
  if (Math.abs(f - 2 / 3) < 0.02) return "2π/3";
  if (Math.abs(f - 0.75) < 0.02) return "3π/4";
  if (Math.abs(f - 1) < 0.02) return "π";
  if (Math.abs(f - 1.25) < 0.02) return "5π/4";
  if (Math.abs(f - 4 / 3) < 0.02) return "4π/3";
  if (Math.abs(f - 1.5) < 0.02) return "3π/2";
  if (Math.abs(f - 5 / 3) < 0.02) return "5π/3";
  if (Math.abs(f - 1.75) < 0.02) return "7π/4";
  if (Math.abs(f - 2) < 0.04) return "2π";
  return `${f.toFixed(2)}π`;
}

const PRESET_ANGLES = [
  { label: "0", value: 0 },
  { label: "π/6", value: Math.PI / 6 },
  { label: "π/4", value: Math.PI / 4 },
  { label: "π/3", value: Math.PI / 3 },
  { label: "π/2", value: Math.PI / 2 },
  { label: "2π/3", value: (2 * Math.PI) / 3 },
  { label: "3π/4", value: (3 * Math.PI) / 4 },
  { label: "π", value: Math.PI },
  { label: "5π/4", value: (5 * Math.PI) / 4 },
  { label: "3π/2", value: (3 * Math.PI) / 2 },
  { label: "7π/4", value: (7 * Math.PI) / 4 },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-neutral-500 mb-2">
      {children}
    </div>
  );
}

function UnitCircleSVG({
  theta,
  size,
}: {
  theta: number;
  size: number;
}) {
  const pad = 52;
  const r = (size - pad * 2) / 2;
  const cx = size / 2;
  const cy = size / 2;

  const px = cx + r * Math.cos(theta);
  const py = cy - r * Math.sin(theta);
  const cosX = cx + r * Math.cos(theta);
  const sinY = cy - r * Math.sin(theta);

  const arcRadius = Math.min(r * 0.22, 48);
  const arcEndX = cx + arcRadius * Math.cos(theta);
  const arcEndY = cy - arcRadius * Math.sin(theta);
  const largeArc = theta > Math.PI ? 1 : 0;

  const labelAngle = theta / 2;
  const labelR = arcRadius + 14;
  const labelX = cx + labelR * Math.cos(labelAngle);
  const labelY = cy - labelR * Math.sin(labelAngle);

  const tickCount = 12;
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const a = (i / tickCount) * TAU;
    return {
      x1: cx + (r - 4) * Math.cos(a),
      y1: cy - (r - 4) * Math.sin(a),
      x2: cx + (r + 4) * Math.cos(a),
      y2: cy - (r + 4) * Math.sin(a),
    };
  });

  const cosVal = Math.cos(theta);
  const sinVal = Math.sin(theta);

  const cosLabelY = cy + (sinVal < 0 ? -14 : 16);
  const sinLabelX = px + (cosVal < 0 ? -8 : 8);
  const sinLabelAnchor = cosVal < 0 ? "end" : "start";

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-full h-full"
      style={{ maxWidth: size, maxHeight: size }}
    >
      <defs>
        <radialGradient id="bg-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(14,165,233,0.06)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <filter id="point-glow">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle cx={cx} cy={cy} r={r + 30} fill="url(#bg-glow)" />

      {/* Grid lines */}
      <line x1={pad - 20} y1={cy} x2={size - pad + 20} y2={cy} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      <line x1={cx} y1={pad - 20} x2={cx} y2={size - pad + 20} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

      {/* Axis labels */}
      <text x={size - pad + 28} y={cy + 4} fill="rgba(255,255,255,0.3)" fontSize="12" fontFamily="monospace" textAnchor="middle">Re</text>
      <text x={cx} y={pad - 26} fill="rgba(255,255,255,0.3)" fontSize="12" fontFamily="monospace" textAnchor="middle">Im</text>

      {/* Unit markers */}
      <text x={cx + r} y={cy + 18} fill="rgba(255,255,255,0.2)" fontSize="10" fontFamily="monospace" textAnchor="middle">1</text>
      <text x={cx - r} y={cy + 18} fill="rgba(255,255,255,0.2)" fontSize="10" fontFamily="monospace" textAnchor="middle">−1</text>
      <text x={cx + 12} y={cy - r + 4} fill="rgba(255,255,255,0.2)" fontSize="10" fontFamily="monospace" textAnchor="start">i</text>
      <text x={cx + 12} y={cy + r + 4} fill="rgba(255,255,255,0.2)" fontSize="10" fontFamily="monospace" textAnchor="start">−i</text>

      {/* Circle ticks */}
      {ticks.map((t, i) => (
        <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      ))}

      {/* Unit circle */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />

      {/* cos(θ) projection line — horizontal from origin to (cos θ, 0) */}
      <line x1={cx} y1={cy} x2={cosX} y2={cy} stroke="#38bdf8" strokeWidth="2" strokeOpacity="0.7" />
      {/* cos(θ) label */}
      <text x={(cx + cosX) / 2} y={cosLabelY} fill="#38bdf8" fontSize="11" fontFamily="monospace" textAnchor="middle" fontWeight="600">
        cos θ
      </text>

      {/* sin(θ) projection line — vertical from (cos θ, 0) to point */}
      <line x1={cosX} y1={cy} x2={px} y2={py} stroke="#f472b6" strokeWidth="2" strokeOpacity="0.7" />
      {/* sin(θ) label */}
      <text x={sinLabelX} y={(cy + sinY) / 2 + 4} fill="#f472b6" fontSize="11" fontFamily="monospace" textAnchor={sinLabelAnchor} fontWeight="600">
        sin θ
      </text>

      {/* Dashed projection guides */}
      <line x1={px} y1={py} x2={px} y2={cy} stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="3 3" />
      <line x1={px} y1={py} x2={cx} y2={py} stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="3 3" />

      {/* Radius line from origin to point */}
      <line x1={cx} y1={cy} x2={px} y2={py} stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />

      {/* Angle arc */}
      {theta > 0.02 && (
        <>
          <path
            d={`M ${cx + arcRadius} ${cy} A ${arcRadius} ${arcRadius} 0 ${largeArc} 0 ${arcEndX} ${arcEndY}`}
            fill="none"
            stroke="#facc15"
            strokeWidth="1.5"
            strokeOpacity="0.7"
          />
          <text x={labelX} y={labelY + 4} fill="#facc15" fontSize="11" fontFamily="monospace" textAnchor="middle" fontWeight="600">
            θ
          </text>
        </>
      )}

      {/* Point on circle */}
      <circle cx={px} cy={py} r="7" fill="#0ea5e9" fillOpacity="0.25" stroke="#0ea5e9" strokeWidth="2" filter="url(#point-glow)" />
      <circle cx={px} cy={py} r="3.5" fill="#0ea5e9" />

      {/* Origin dot */}
      <circle cx={cx} cy={cy} r="3" fill="rgba(255,255,255,0.3)" />

      {/* Point label */}
      <text
        x={px + (Math.cos(theta) >= 0 ? 14 : -14)}
        y={py + (Math.sin(theta) >= 0 ? -12 : 18)}
        fill="rgba(255,255,255,0.7)"
        fontSize="11"
        fontFamily="monospace"
        textAnchor={Math.cos(theta) >= 0 ? "start" : "end"}
      >
        e
        <tspan fontSize="8" dy="-4">iθ</tspan>
      </text>
    </svg>
  );
}

export default function EulerFormulaViz() {
  const [theta, setTheta] = useState(Math.PI / 4);
  const [isAnimating, setIsAnimating] = useState(false);
  const [animSpeed, setAnimSpeed] = useState(1);
  const animRef = useRef(0);
  const lastTRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgSize, setSvgSize] = useState(500);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setSvgSize(Math.max(300, Math.min(width, height) - 40));
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!isAnimating) {
      lastTRef.current = 0;
      return;
    }
    const step = (time: number) => {
      if (lastTRef.current === 0) lastTRef.current = time;
      const dt = (time - lastTRef.current) / 1000;
      lastTRef.current = time;
      setTheta((prev) => (prev + dt * animSpeed) % TAU);
      animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animRef.current);
  }, [isAnimating, animSpeed]);

  const toggleAnim = useCallback(() => {
    setIsAnimating((p) => !p);
  }, []);

  const cosVal = Math.cos(theta);
  const sinVal = Math.sin(theta);

  const complexStr = useMemo(() => {
    const rePart = cosVal.toFixed(3);
    const imAbs = Math.abs(sinVal).toFixed(3);
    if (Math.abs(sinVal) < 0.001) return rePart;
    const sign = sinVal >= 0 ? "+" : "−";
    return `${rePart} ${sign} ${imAbs}i`;
  }, [cosVal, sinVal]);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[300px] shrink-0 border-r border-white/[0.06] bg-[#0b1019] overflow-y-auto p-4 space-y-5">
        <section>
          <SectionLabel>Angle θ</SectionLabel>
          <div className="flex justify-between mb-1">
            <span className="text-[10px] text-neutral-500">Value</span>
            <span className="text-[10px] font-mono text-neutral-400">
              {formatAngleFraction(theta)} ({(theta * (180 / Math.PI)).toFixed(1)}°)
            </span>
          </div>
          <Slider
            value={[theta]}
            onValueChange={([v]) => {
              setTheta(v);
              setIsAnimating(false);
            }}
            min={0}
            max={TAU}
            step={0.01}
          />
        </section>

        <section>
          <SectionLabel>Preset Angles</SectionLabel>
          <div className="grid grid-cols-4 gap-1.5">
            {PRESET_ANGLES.map((p) => (
              <Tooltip key={p.label}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      setTheta(p.value);
                      setIsAnimating(false);
                    }}
                    className={`h-8 rounded-md text-[11px] font-mono font-medium transition-all duration-150 ${
                      Math.abs(theta - p.value) < 0.02
                        ? "bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-500/30"
                        : "bg-white/[0.04] text-neutral-500 hover:bg-white/[0.07] hover:text-neutral-300"
                    }`}
                  >
                    {p.label}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {(p.value * (180 / Math.PI)).toFixed(0)}°
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </section>

        <section>
          <SectionLabel>Animation</SectionLabel>
          <div className="flex gap-1.5 mb-3">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleAnim}
              className="flex-1 font-mono text-[11px]"
            >
              {isAnimating ? "⏸ Pause" : "▶ Animate"}
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTheta(0);
                    setIsAnimating(false);
                  }}
                >
                  ↺
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset to 0</TooltipContent>
            </Tooltip>
          </div>
          <div>
            <div className="flex justify-between mb-1">
              <span className="text-[10px] text-neutral-500">Speed</span>
              <span className="text-[10px] font-mono text-neutral-400">
                {animSpeed.toFixed(1)}× rad/s
              </span>
            </div>
            <Slider
              value={[animSpeed]}
              onValueChange={([v]) => setAnimSpeed(v)}
              min={0.1}
              max={4}
              step={0.1}
            />
          </div>
        </section>

        <section>
          <SectionLabel>Values</SectionLabel>
          <div className="space-y-2.5 font-mono text-[12px]">
            <div className="flex items-center gap-2">
              <span className="text-neutral-500 w-16 shrink-0">e<sup>iθ</sup></span>
              <span className="text-neutral-300">{complexStr}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#38bdf8] w-16 shrink-0">cos θ</span>
              <span className="text-neutral-300">{cosVal.toFixed(4)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#f472b6] w-16 shrink-0">sin θ</span>
              <span className="text-neutral-300">{sinVal.toFixed(4)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-neutral-500 w-16 shrink-0">|e<sup>iθ</sup>|</span>
              <span className="text-neutral-300">{Math.sqrt(cosVal ** 2 + sinVal ** 2).toFixed(4)}</span>
            </div>
          </div>
        </section>

        <section>
          <SectionLabel>Euler's Formula</SectionLabel>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4 font-mono text-sm text-center leading-relaxed">
            <div className="text-neutral-200">
              e<sup className="text-[#facc15]">iθ</sup> = <span className="text-[#38bdf8]">cos θ</span> + i · <span className="text-[#f472b6]">sin θ</span>
            </div>
            <div className="mt-3 text-[11px] text-neutral-500 border-t border-white/[0.06] pt-3">
              At θ = {formatAngleFraction(theta)}:
            </div>
            <div className="mt-1 text-neutral-300 text-[12px]">
              e<sup className="text-[#facc15]">i·{formatAngleFraction(theta)}</sup> = <span className="text-[#38bdf8]">{cosVal.toFixed(3)}</span> + i · <span className="text-[#f472b6]">{sinVal.toFixed(3)}</span>
            </div>
          </div>
        </section>

        <section>
          <SectionLabel>Key Identity</SectionLabel>
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3 font-mono text-[11px] text-center space-y-1.5 text-neutral-400">
            <div>e<sup>iπ</sup> + 1 = 0</div>
            <div className="text-[10px] text-neutral-600">Euler's Identity</div>
          </div>
        </section>
      </aside>

      {/* Visualization */}
      <main
        ref={containerRef}
        className="flex-1 relative overflow-hidden flex items-center justify-center"
        style={{
          background:
            "radial-gradient(ellipse at 50% 50%, rgba(14,165,233,0.03) 0%, transparent 65%), #080c14",
        }}
      >
        <UnitCircleSVG theta={theta} size={svgSize} />

        {/* Formula overlay */}
        <div className="absolute top-4 left-4 px-3 py-1.5 rounded-md border border-cyan-500/20 bg-black/30 backdrop-blur-sm font-mono text-sm">
          <span className="text-neutral-200">
            e<sup className="text-[#facc15]">iθ</sup>
          </span>
          <span className="text-neutral-500 mx-2">=</span>
          <span className="text-[#38bdf8]">{cosVal.toFixed(3)}</span>
          <span className="text-neutral-500 mx-1">+</span>
          <span className="text-[#f472b6]">{sinVal.toFixed(3)}</span>
          <span className="text-neutral-500">i</span>
        </div>

        {/* Coordinates overlay */}
        <div className="absolute bottom-4 right-4 font-mono text-[10px] text-neutral-500 bg-black/30 backdrop-blur-sm rounded-md px-3 py-2 border border-white/[0.04]">
          <div className="flex gap-4">
            <span>
              θ = <span className="text-neutral-300">{formatAngleFraction(theta)}</span>
            </span>
            <span>
              Re = <span className="text-[#38bdf8]">{cosVal.toFixed(3)}</span>
            </span>
            <span>
              Im = <span className="text-[#f472b6]">{sinVal.toFixed(3)}</span>
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
