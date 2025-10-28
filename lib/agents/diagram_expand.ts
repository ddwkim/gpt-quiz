import { DiagramIRSchema, type DiagramIR } from '@/lib/mermaid/schema';
import { callJson } from '@/lib/openai-client';

const EDGE_LABELS = 'causes, leads_to, computes, depends_on, configures, constrains, reads_from, writes_to, validates, triggers, emits';

export const EXPAND_SYSTEM = [
  'You expand a valid JSON IR for a Mermaid flowchart by adding safe detail. Return ONLY JSON matching the provided schema.',
  '',
  'Contract:',
  '- Input: current IR JSON, target budgets, and guidance.',
  '- Output: refined IR (entire object) preserving valid IDs and existing structure.',
  '- Direction remains unchanged; keep nodes sorted by importance.',
  '- Node ids: ^[A-Za-z_][A-Za-z0-9_]*$, ASCII, not reserved.',
  '- Labels: ASCII <=60 chars; trim redundancy; avoid unmatched quotes.',
  `- Shapes: use whitelist (rect, decision, terminator, io, db, subroutine, stadium, circle, double_circle, hexagon, parallelogram, trap). Only set when semantically helpful.`,
  `- Edge labels optional; if used, select from ${EDGE_LABELS}.`,
  '- Subgraphs optional; title ASCII <=60 chars; nodeIds reference existing nodes.',
  '- Preserve existing ids whenever valid; reuse nodeIds in subgraphs; retain evidence metadata if present.',
  "- ABSOLUTE LABEL BAN LIST: Labels must not contain [, ], {, }, (, ), <, >, \" or ' characters. Rewrite these tokens (e.g., [→LB, ]→RB, remove quotes) before emitting.",
  '- No HTML in labels. Use line segmentation (see below) and let the compiler render multi-line labels.',
  '- Multi-line labels: emit as labelLines: string[] in the IR instead of embedding <br/>. Each line obeys the same ban list.',
  '- Preserve IDs; never inject shape tokens into labels.',
  '- If a label cannot be expressed without banned chars, drop the least important tokens first (by weight) until the ban holds.',
  '',
  'Budgets:',
  '- Respect target maxNodes/maxEdges. Protect mustInclude ids/labels and decision nodes. Drop lowest-weight off-topic items first.',
  '',
  'Reliability:',
  '- Deterministic ordering. No commentary, Markdown, or Mermaid text.'
].join('\n');

export function buildExpandUserPrompt(
  currentIR: any,
  guidance: {
    targetMaxNodes: number;
    targetMaxEdges: number;
    preferGroups?: boolean;
    preferEdgeLabels?: boolean;
    mustInclude?: string[];
    exclude?: string[];
    depthHint?: string;
  },
  excerpt: string
) {
  return [
    `Task: Expand the IR with focused detail while staying within budgets and schema rules.`,
    `Budgets: maxNodes=${guidance.targetMaxNodes}, maxEdges=${guidance.targetMaxEdges}`,
    `Preferences: groups=${guidance.preferGroups ? 'yes' : 'no'}, edge_labels=${guidance.preferEdgeLabels ? 'yes' : 'no'}, depth=${guidance.depthHint ?? '2-3 layers'}`,
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
