import { describe, it, expect } from 'vitest';
import { fixTokenIssues } from '@/lib/mermaid/mutators';
import { canonicalizeIR } from '@/lib/ir/canonicalize';
import { compileToMermaid } from '@/lib/mermaid/compiler';
import { validateMermaid } from '@/lib/mermaid/validate';
import type { IR } from '@/lib/ir/schema';

const rawIR: IR = {
  kind: 'flowchart',
  direction: 'TB',
  nodes: [
    { id: 'aws_ofi', label: 'aws-ofi: [EFA]] driver', shape: 'subroutine', weight: 3 },
    { id: 'efa_init', label: 'EFA init -> {handshake}', shape: 'decision', weight: 2 },
    { id: 'done', label: 'Complete ) state', shape: 'terminator', weight: 1 }
  ],
  edges: [
    { from: 'aws_ofi', to: 'efa_init', label: 'configures' },
    { from: 'efa_init', to: 'done', label: 'leads_to' }
  ]
};

describe('fixTokenIssues', () => {
  it('sanitizes labels with closers and compiles to valid Mermaid', async () => {
    const fixed = fixTokenIssues(rawIR);
    const canonical = canonicalizeIR(fixed);
    const mermaid = compileToMermaid(canonical);
    const result = await validateMermaid(mermaid);
    expect(result.ok).toBe(true);
    const awsNode = canonical.nodes.find((n) => n.id === 'aws_ofi');
    expect(['rect', 'decision', 'terminator']).toContain(awsNode?.shape);
    expect(awsNode?.labelLines ?? []).not.toContain('aws-ofi: [EFA]] driver');
  });
});
