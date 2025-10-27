import { DiagramIRSchema, type DiagramIR } from '@/lib/mermaid/schema';
import { callJson } from '@/lib/openai-client';

export const IR_SYSTEM = `
You generate JSON IR for a Mermaid flowchart (not Mermaid text). Return ONLY JSON matching the provided schema.

Contract:
- Output fields: kind="flowchart", direction in {TB,BT,LR,RL}, nodes[], edges[], optional subgraphs[], style.wrapLabelsAt.
- IDs must match ^[A-Za-z0-9_]+$; human labels go in label; may add optional weight and group.
- Keep labels concise; abbreviate where needed.
 - Prefer hierarchical detail: 2–3 layers where useful. Use group to cluster focus-critical nodes (caller may assign subgraph title).
 - Use edge labels to encode relation type (causes, leads_to, computes, depends_on, configures, constrains). Keep labels short.

Reliability:
- Deterministic; low temperature set upstream.
- No commentary, no code fences, no Mermaid.
`;

export function buildIRUserPrompt(spec: string, direction: 'TB' | 'BT' | 'LR' | 'RL') {
  return [`Task: derive a flowchart IR from the following spec.`, `Direction: ${direction}`, `Spec:\n${spec}`].join('\n\n');
}

export async function generateIRFromSpec(
  spec: string,
  direction: 'TB' | 'BT' | 'LR' | 'RL',
  model?: string
): Promise<DiagramIR> {
  const user = buildIRUserPrompt(spec, direction);
  const ir = await callJson<DiagramIR>({
    system: IR_SYSTEM,
    user,
    schema: DiagramIRSchema,
    model,
    parser: { parse: (x: any) => x } as any,
    agent: 'IR_Generate'
  });
  return ir;
}

export function buildIRUserPromptFromFocus(
  focus: { topic: string; mustInclude?: string[]; exclude?: string[]; maxNodes?: number; maxEdges?: number; direction?: 'TB' | 'BT' | 'LR' | 'RL'; subgraphTitle?: string },
  transcriptExcerpt: string
) {
  const include = (focus.mustInclude ?? []).join(', ') || 'None';
  const exclude = (focus.exclude ?? []).join(', ') || 'None';
  const maxN = focus.maxNodes ?? 12;
  const maxE = focus.maxEdges ?? Math.max(16, Math.round(1.5 * maxN));
  const dir = focus.direction ?? 'TB';

  return [
    `Task: Build a *flowchart* IR centered strictly on the TOPIC and constraints below.`,
    `TOPIC: ${focus.topic}`,
    `MUST INCLUDE (as nodes or explicit labels): ${include}`,
    `EXCLUDE (do not include as nodes or labels): ${exclude}`,
    `HARD BUDGETS: maxNodes=${maxN}, maxEdges=${maxE}`,
    `DIRECTION: ${dir}`,
    `Structure: prefer 2–3 layers of detail with small branching factor. Use group for the most central nodes (subgraph title may be "${focus.subgraphTitle ?? 'Focus'}").`,
    `Edges: add short relation labels (causes, leads_to, computes, depends_on, configures, constrains).`,
    `Content: include concise formulas/decision rules as labels when they help comprehension (e.g., key equations).`,
    `Budget policy: keep mustInclude even if low-weight; when over budget, drop the lowest-weight, off-topic items first.`,
    `Fallback: if detail exceeds budgets, collapse off-topic into 1–2 aggregate nodes (e.g., "Other steps").`,
    `Priority: nodes that directly explain the TOPIC’s mechanism/causality. Assign higher weight to central items.`,
    `SOURCE EXCERPT (already filtered to be relevant):`,
    transcriptExcerpt
  ].join('\n');
}
