import { useState, type ComponentType } from "react";
import { cn } from "@/lib/utils";
import QuantumGateViz from "./quantum-gates/QuantumGateViz";
import EulerFormulaViz from "./euler-formula/EulerFormulaViz";
import GroversAlgorithmViz from "./grovers-algorithm/GroversAlgorithmViz";

interface VisualizationEntry {
  id: string;
  name: string;
  component: ComponentType;
}

const visualizations: VisualizationEntry[] = [
  {
    id: "quantum-gates",
    name: "Quantum Gates",
    component: QuantumGateViz,
  },
  {
    id: "euler-formula",
    name: "Euler's Formula",
    component: EulerFormulaViz,
  },
  {
    id: "grovers-algorithm",
    name: "Grover's Algorithm",
    component: GroversAlgorithmViz,
  },
];

export default function AppShell() {
  const [activeId, setActiveId] = useState(visualizations[0].id);
  const active =
    visualizations.find((v) => v.id === activeId) ?? visualizations[0];
  const ActiveComponent = active.component;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#080c14] text-white">
      {/* ── Navigation bar ── */}
      <header className="flex items-center gap-5 px-5 py-2 border-b border-white/[0.06] bg-[#0a0f18]/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2.5 shrink-0">
          <div
            className="w-2 h-2 rounded-full"
            style={{
              background: "#0ea5e9",
              boxShadow: "0 0 8px #0ea5e9, 0 0 16px #0ea5e944",
            }}
          />
          <span className="text-[11px] font-semibold tracking-widest uppercase text-neutral-500">
            Quantum Viz
          </span>
        </div>

        <div className="w-px h-4 bg-white/[0.08]" />

        <nav className="flex items-center gap-0.5">
          {visualizations.map((viz) => (
            <button
              key={viz.id}
              onClick={() => setActiveId(viz.id)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                activeId === viz.id
                  ? "bg-white/[0.08] text-neutral-200"
                  : "text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.04]",
              )}
            >
              {viz.name}
            </button>
          ))}
        </nav>
      </header>

      {/* ── Active visualization ── */}
      <ActiveComponent />
    </div>
  );
}
