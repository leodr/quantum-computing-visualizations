export interface Complex {
  re: number;
  im: number;
}

export type QubitState = [Complex, Complex];
export type Matrix2x2 = [[Complex, Complex], [Complex, Complex]];

export const complex = (re: number, im = 0): Complex => ({ re, im });

export const C_ZERO: Complex = { re: 0, im: 0 };
export const C_ONE: Complex = { re: 1, im: 0 };
export const C_I: Complex = { re: 0, im: 1 };
export const C_NEG_ONE: Complex = { re: -1, im: 0 };
export const C_NEG_I: Complex = { re: 0, im: -1 };

export const cAdd = (a: Complex, b: Complex): Complex => ({
  re: a.re + b.re,
  im: a.im + b.im,
});

export const cMul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});

export const cScale = (c: Complex, s: number): Complex => ({
  re: c.re * s,
  im: c.im * s,
});

export const cConj = (c: Complex): Complex => ({ re: c.re, im: -c.im });

export const cAbs = (c: Complex): number =>
  Math.sqrt(c.re * c.re + c.im * c.im);

export const cAbs2 = (c: Complex): number => c.re * c.re + c.im * c.im;

export const cExp = (c: Complex): Complex => {
  const r = Math.exp(c.re);
  return { re: r * Math.cos(c.im), im: r * Math.sin(c.im) };
};

export const cFromPolar = (r: number, theta: number): Complex => ({
  re: r * Math.cos(theta),
  im: r * Math.sin(theta),
});

// ── State operations ────────────────────────────────────────

export const applyGate = (gate: Matrix2x2, state: QubitState): QubitState => [
  cAdd(cMul(gate[0][0], state[0]), cMul(gate[0][1], state[1])),
  cAdd(cMul(gate[1][0], state[0]), cMul(gate[1][1], state[1])),
];

export const normalizeState = (state: QubitState): QubitState => {
  const norm = Math.sqrt(cAbs2(state[0]) + cAbs2(state[1]));
  if (norm < 1e-10) return [C_ONE, C_ZERO];
  return [cScale(state[0], 1 / norm), cScale(state[1], 1 / norm)];
};

export const stateToBloch = (state: QubitState): [number, number, number] => {
  const [a, b] = normalizeState(state);
  const prod = cMul(cConj(a), b);
  return [2 * prod.re, 2 * prod.im, cAbs2(a) - cAbs2(b)];
};

export const stateFromAngles = (theta: number, phi: number): QubitState => [
  complex(Math.cos(theta / 2)),
  cScale(cFromPolar(1, phi), Math.sin(theta / 2)),
];

export const isRealValued = (state: QubitState): boolean => {
  const [a, b] = normalizeState(state);
  return Math.abs(a.im) < 1e-6 && Math.abs(b.im) < 1e-6;
};

// ── Bloch sphere interpolation ──────────────────────────────

export const slerp = (
  v0: [number, number, number],
  v1: [number, number, number],
  t: number,
): [number, number, number] => {
  let dot = v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2];
  dot = Math.max(-1, Math.min(1, dot));

  if (Math.abs(dot) > 0.9995) {
    const r: [number, number, number] = [
      v0[0] + (v1[0] - v0[0]) * t,
      v0[1] + (v1[1] - v0[1]) * t,
      v0[2] + (v1[2] - v0[2]) * t,
    ];
    const len = Math.sqrt(r[0] ** 2 + r[1] ** 2 + r[2] ** 2);
    return len < 1e-10 ? v0 : [r[0] / len, r[1] / len, r[2] / len];
  }

  const omega = Math.acos(dot);
  const so = Math.sin(omega);
  const s0 = Math.sin((1 - t) * omega) / so;
  const s1 = Math.sin(t * omega) / so;
  return [
    s0 * v0[0] + s1 * v1[0],
    s0 * v0[1] + s1 * v1[1],
    s0 * v0[2] + s1 * v1[2],
  ];
};

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

// ── Gate definitions ────────────────────────────────────────

const S2 = 1 / Math.sqrt(2);

export interface GateInfo {
  name: string;
  label: string;
  description: string;
  matrix: Matrix2x2;
  color: string;
}

export const FIXED_GATES: Record<string, GateInfo> = {
  H: {
    name: "H",
    label: "Hadamard",
    description: "Creates superposition. Maps |0⟩→|+⟩, |1⟩→|-⟩",
    matrix: [
      [complex(S2), complex(S2)],
      [complex(S2), complex(-S2)],
    ],
    color: "#38bdf8",
  },
  X: {
    name: "X",
    label: "Pauli-X",
    description: "Bit flip. Rotation of π around X axis",
    matrix: [
      [C_ZERO, C_ONE],
      [C_ONE, C_ZERO],
    ],
    color: "#f87171",
  },
  Y: {
    name: "Y",
    label: "Pauli-Y",
    description: "Bit + phase flip. Rotation of π around Y axis",
    matrix: [
      [C_ZERO, C_NEG_I],
      [C_I, C_ZERO],
    ],
    color: "#facc15",
  },
  Z: {
    name: "Z",
    label: "Pauli-Z",
    description: "Phase flip. Rotation of π around Z axis",
    matrix: [
      [C_ONE, C_ZERO],
      [C_ZERO, C_NEG_ONE],
    ],
    color: "#4ade80",
  },
  S: {
    name: "S",
    label: "S Phase",
    description: "Quarter turn. Rotation of π/2 around Z axis",
    matrix: [
      [C_ONE, C_ZERO],
      [C_ZERO, C_I],
    ],
    color: "#a78bfa",
  },
  T: {
    name: "T",
    label: "T Gate",
    description: "π/8 gate. Rotation of π/4 around Z axis",
    matrix: [
      [C_ONE, C_ZERO],
      [C_ZERO, cFromPolar(1, Math.PI / 4)],
    ],
    color: "#c084fc",
  },
};

export const ROTATION_GATES: Record<
  string,
  {
    name: string;
    label: string;
    description: string;
    create: (angle: number) => Matrix2x2;
    color: string;
  }
> = {
  Rx: {
    name: "Rx",
    label: "Rₓ(θ)",
    description: "Rotation around X axis by angle θ",
    create: (t) => [
      [complex(Math.cos(t / 2)), complex(0, -Math.sin(t / 2))],
      [complex(0, -Math.sin(t / 2)), complex(Math.cos(t / 2))],
    ],
    color: "#fb923c",
  },
  Ry: {
    name: "Ry",
    label: "Rᵧ(θ)",
    description: "Rotation around Y axis by angle θ",
    create: (t) => [
      [complex(Math.cos(t / 2)), complex(-Math.sin(t / 2))],
      [complex(Math.sin(t / 2)), complex(Math.cos(t / 2))],
    ],
    color: "#34d399",
  },
  Rz: {
    name: "Rz",
    label: "Rᵤ(θ)",
    description: "Rotation around Z axis by angle θ",
    create: (t) => [
      [cExp(complex(0, -t / 2)), C_ZERO],
      [C_ZERO, cExp(complex(0, t / 2))],
    ],
    color: "#60a5fa",
  },
};

// ── Preset states ───────────────────────────────────────────

export const PRESET_STATES: Record<string, QubitState> = {
  "|0⟩": [C_ONE, C_ZERO],
  "|1⟩": [C_ZERO, C_ONE],
  "|+⟩": [complex(S2), complex(S2)],
  "|-⟩": [complex(S2), complex(-S2)],
  "|i⟩": [complex(S2), complex(0, S2)],
  "|-i⟩": [complex(S2), complex(0, -S2)],
};

// ── Formatting ──────────────────────────────────────────────

export const formatComplex = (c: Complex, precision = 3): string => {
  const re = Math.abs(c.re) < 1e-10 ? 0 : c.re;
  const im = Math.abs(c.im) < 1e-10 ? 0 : c.im;

  if (im === 0) return re.toFixed(precision);
  if (re === 0) {
    if (Math.abs(im - 1) < 1e-10) return "i";
    if (Math.abs(im + 1) < 1e-10) return "−i";
    return `${im > 0 ? "" : "−"}${Math.abs(im).toFixed(precision)}i`;
  }

  const absIm = Math.abs(im);
  const imPart =
    Math.abs(absIm - 1) < 1e-10 ? "i" : `${absIm.toFixed(precision)}i`;

  return `${re.toFixed(precision)}${im > 0 ? "+" : "−"}${imPart}`;
};

export const isUnitary = (m: Matrix2x2): boolean => {
  const [[a, b], [c, d]] = m;
  const m00 = cAbs2(a) + cAbs2(c);
  const m11 = cAbs2(b) + cAbs2(d);
  const m01 = cAdd(cMul(cConj(a), b), cMul(cConj(c), d));
  return (
    Math.abs(m00 - 1) < 0.05 &&
    Math.abs(m11 - 1) < 0.05 &&
    cAbs(m01) < 0.05
  );
};
