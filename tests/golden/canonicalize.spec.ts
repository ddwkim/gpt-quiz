import { describe, it, expect } from 'vitest';
import { canonicalizeIR } from '@/lib/ir/canonicalize';
import type { IR } from '@/lib/ir/schema';

function makeIR(): IR {
  return {
    kind: 'flowchart',
    direction: 'TB',
    nodes: [
      { id: '1-start', label: 'Start node with a very long label that should be truncated at sixty characters exactly for safety', weight: 1 },
      { id: 'Compute', label: 'compute value', weight: 5 },
      { id: 'Compute', label: 'duplicate id', weight: 3 },
      { id: 'final', label: 'Final', weight: 2 }
    ],
    edges: [
      { from: '1-start', to: 'Compute!!', label: 'depends_on' },
      { from: 'Compute', to: 'final', label: 'leads_to' },
      { from: 'Compute', to: 'final', label: 'leads_to' }
    ],
    subgraphs: [
      { title: 'Ops:"Group" : Primary', nodeIds: ['1-start', 'missing'] },
      { title: 'Solo', nodeIds: ['final'] }
    ]
  };
}

describe('canonicalizeIR', () => {
  it('sanitizes ids, truncates labels, deduplicates nodes and edges', () => {
    const canonical = canonicalizeIR(makeIR());
    const ids = canonical.nodes.map((n) => n.id);
    expect(ids).toEqual(['Compute', 'final', 'n_1_start']);
    const labels = canonical.nodes.map((n) => n.label);
    expect(labels[0]).toBe('compute value');
    expect(labels[2].length).toBeLessThanOrEqual(60);
    expect(canonical.edges).toHaveLength(1);
    expect(canonical.edges[0].from).toBe('Compute');
    expect(canonical.edges[0].to).toBe('final');
    expect(canonical.subgraphs ?? []).toEqual([]);
  });
});
