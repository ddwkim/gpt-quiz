import { DiagramIRSchema, type DiagramIR } from '@/lib/mermaid/schema';
import { callJson } from '@/lib/openai-client';

export const EXPAND_SYSTEM = `
You EXPAND a valid JSON IR for a Mermaid flowchart by adding detail safely. Return ONLY JSON matching the provided schema.

Contract:
- Input: current IR JSON, target budgets, and guidance.
- Output: a refined IR (full object), preserving validity and IDs where possible.
- Constraints:
  - Keep direction unchanged.
  - Maintain simple syntax: nodes and A --> B edges. You MAY add short edge labels.
  - You MAY add subgraphs for clustering only if within budgets and safe.
  - IDs remain ^[A-Za-z0-9_]+$; labels concise; ASCII.
  - Use weight to indicate centrality; optionally set group for core nodes.

Budgets:
- Respect target maxNodes and maxEdges. Favor MUST INCLUDE terms. Drop least-important off-topic items first if needed.

Reliability:
- Deterministic; no commentary or Mermaid text.

Strict IR Rules (to ensure later Mermaid validity):
- Keep IDs ASCII ^[A-Za-z0-9_]+$ and not reserved (end, subgraph, graph, classDef, style, linkStyle, click, accTitle, accDescr, flowchart, sequenceDiagram, classDiagram, erDiagram, stateDiagram, mindmap).
- Labels: ASCII punctuation; avoid raw/unmatched quotes; keep <=100 chars.
- Do not introduce classes/styles/themes; use only nodes and A --> B edges (short edge labels allowed).
`;

export function buildExpandUserPrompt(
  currentIR: any,
  guidance: {
    targetMaxNodes: number;
    targetMaxEdges: number;
    preferGroups?: boolean;
    preferEdgeLabels?: boolean;
    mustInclude?: string[];
    exclude?: string[];
    depthHint?: string; // e.g., '2–3 layers'
  },
  excerpt: string
) {
  return [
    `Task: Expand the IR safely with more detail while staying within budgets.`,
    `Budgets: maxNodes=${guidance.targetMaxNodes}, maxEdges=${guidance.targetMaxEdges}`,
    `Preferences: groups=${guidance.preferGroups ? 'yes' : 'no'}, edge_labels=${guidance.preferEdgeLabels ? 'yes' : 'no'}, depth=${guidance.depthHint ?? '2–3 layers'}`,
    `MUST INCLUDE: ${(guidance.mustInclude ?? []).join(', ') || 'None'}`,
    `EXCLUDE: ${(guidance.exclude ?? []).join(', ') || 'None'}`,
    `Current IR (JSON):`,
    JSON.stringify(currentIR),
    `Relevant source excerpt:`,
    excerpt
  ].join('\n');
}

export async function expandIR(
  params: {
    currentIR: any;
    targetMaxNodes: number;
    targetMaxEdges: number;
    preferGroups?: boolean;
    preferEdgeLabels?: boolean;
    mustInclude?: string[];
    exclude?: string[];
    depthHint?: string;
    excerpt: string;
  },
  model?: string
): Promise<DiagramIR> {
  const user = buildExpandUserPrompt(
    params.currentIR,
    {
      targetMaxNodes: params.targetMaxNodes,
      targetMaxEdges: params.targetMaxEdges,
      preferGroups: params.preferGroups,
      preferEdgeLabels: params.preferEdgeLabels,
      mustInclude: params.mustInclude,
      exclude: params.exclude,
      depthHint: params.depthHint
    },
    params.excerpt
  );

  const ir = await callJson<DiagramIR>({
    system: EXPAND_SYSTEM,
    user,
    schema: DiagramIRSchema,
    model,
    parser: { parse: (x: any) => x } as any,
    agent: 'DiagramExpand'
  });
  return ir;
}
