export interface BuildMetrics {
  iters: number; reasons: {code: string, count: number}[];
  nodes: number; edges: number; density: number;
  renderer: 'dagre'|'elk';
  parseMs: number; compileMs: number;
  version: { mermaid: string; app: string };
}
export function emitDiagramMetrics(m: BuildMetrics): void { /* no-op or console/event */ }
