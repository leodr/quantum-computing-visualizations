# Quantum Computing Visualizations

I want this repo to be a web based visualization tool to help me understand quantum computing.

## Tech Stack

- Vite, React, TypeScript
- React Three Fiber / Three.js for visualizations
- shadcn/ui for UI

## Using shadcn/ui

All components are installed, feel free to use whatever is available.

## Navigation / Adding Visualizations

The app uses a tab-based navigation in the top bar, defined in `src/components/AppShell.tsx`. Each visualization is a self-contained React component that fills the space below the nav bar.

To add a new visualization:

1. Create a directory under `src/components/` for the visualization (e.g. `src/components/my-viz/`).
2. Build the component so it renders with `className="flex flex-1 overflow-hidden"` as its root — the shell provides the full-height dark-themed container.
3. Import the component in `src/components/AppShell.tsx` and add an entry to the `visualizations` array:

```ts
{
  id: "my-viz",
  name: "My Visualization",
  component: MyVizComponent,
}
```

That's it — the tab appears automatically in the nav bar.

### Existing visualizations

| ID | Name | Description |
|----|------|-------------|
| `quantum-gates` | Quantum Gates | Single-qubit gate operations on an interactive 3D Bloch sphere |
| `euler-formula` | Euler's Formula | Interactive 2D unit circle in the complex plane showing e^(iθ) = cos θ + i sin θ |
| `grovers-algorithm` | Grover's Algorithm | Step-by-step animation of Grover's search on 4 qubits with Bloch spheres and amplitude bar chart |
