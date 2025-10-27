import { DiagramIRSchema, type DiagramIR } from '@/lib/mermaid/schema';
import { callJson } from '@/lib/openai-client';

export const OUTLINE_SYSTEM = `
You produce a MINIMAL JSON IR for a Mermaid flowchart (not Mermaid text). Return ONLY JSON matching the provided schema.

Goal:
- Build a coarse, big-picture IR with very simple, safe constructs that parse reliably.

Contract:
- Output: kind="flowchart", direction in {TB,BT,LR,RL}, nodes[], edges[]. No styles, no classes.
- IDs: ^[A-Za-z0-9_]+$; human labels in label; ASCII punctuation.
- Edge labels optional; keep short if used. Prefer unlabeled edges at this stage.
- Do NOT emit subgraphs in the outline stage.

Budgets:
- Outline budgets are small (e.g., nodes ≤ 6, edges ≤ 8). Caller will refine later.

Reliability:
- Deterministic; do not include commentary or Mermaid.

Strict IR Rules (to ensure later Mermaid validity):
- IDs: ASCII, ^[A-Za-z0-9_]+$, not reserved (end, subgraph, graph, classDef, style, linkStyle, click, accTitle, accDescr, flowchart, sequenceDiagram, classDiagram, erDiagram, stateDiagram, mindmap).
- Labels: ASCII punctuation; avoid embedded unmatched quotes; keep labels concise (<=100 chars).
- Edges: represent as simple A --> B in the compiled Mermaid; avoid fancy connectors at this stage.
`;

export function buildOutlineUserPrompt(
  topic: string,
  direction: 'TB' | 'BT' | 'LR' | 'RL',
  excerpt: string,
  mustInclude: string[] = [],
  exclude: string[] = [],
  maxNodes = 6,
  maxEdges = 8
) {
  return [
    `Task: Produce a minimal *flowchart* IR for the TOPIC using only simple nodes and A --> B edges.`,
    `TOPIC: ${topic}`,
    `MUST INCLUDE: ${mustInclude.join(', ') || 'None'}`,
    `EXCLUDE: ${exclude.join(', ') || 'None'}`,
    `DIRECTION: ${direction}`,
    `HARD BUDGETS: maxNodes=${maxNodes}, maxEdges=${maxEdges}`,
    `SOURCE EXCERPT:`,
    excerpt
  ].join('\n');
}

export async function generateOutlineIR(
  params: {
    topic: string;
    direction: 'TB' | 'BT' | 'LR' | 'RL';
    excerpt: string;
    mustInclude?: string[];
    exclude?: string[];
    maxNodes?: number;
    maxEdges?: number;
  },
  model?: string
): Promise<DiagramIR> {
  const user = buildOutlineUserPrompt(
    params.topic,
    params.direction,
    params.excerpt,
    params.mustInclude ?? [],
    params.exclude ?? [],
    params.maxNodes ?? 6,
    params.maxEdges ?? 8
  );

  const ir = await callJson<DiagramIR>({
    system: OUTLINE_SYSTEM,
    user,
    schema: DiagramIRSchema,
    model,
    parser: { parse: (x: any) => x } as any,
    agent: 'DiagramOutline'
  });
  return ir;
}
