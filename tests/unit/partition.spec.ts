import { describe, it, expect } from 'vitest';
import { partitionIR } from '@/lib/pipeline/partition';
import type { IR } from '@/lib/ir/schema';

const baseIR: IR = {
  kind: 'flowchart',
  direction: 'TB',
  nodes: Array.from({ length: 6 }).map((_, idx) => ({ id: `n${idx}`, label: `Node ${idx}`, weight: 6 - idx, shape: 'rect' })),
  edges: [
    { from: 'n0', to: 'n1' },
    { from: 'n1', to: 'n2' },
    { from: 'n2', to: 'n3' },
    { from: 'n3', to: 'n4' },
    { from: 'n4', to: 'n5' }
  ]
};

describe('partitionIR', () => {
  it('returns single diagram when within budgets', () => {
    const pack = partitionIR(baseIR, { mode: 'none', budgets: { maxNodes: 18, maxEdges: 22, targetDensity: 1.1, maxBridges: 6 } });
    expect(pack.meta.k).toBe(1);
    expect(pack.diagrams[0].ir.nodes.length).toBe(6);
  });

  it('splits diagrams when auto mode and budgets exceeded', () => {
    const pack = partitionIR(baseIR, { mode: 'auto', budgets: { maxNodes: 3, maxEdges: 22, targetDensity: 0.5, maxBridges: 6 } });
    expect(pack.meta.k).toBeGreaterThanOrEqual(2);
    expect(pack.diagrams[0].ir.nodes.length).toBeLessThanOrEqual(3);
  });
});
