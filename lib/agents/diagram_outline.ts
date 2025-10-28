import { DiagramIRSchema, type DiagramIR } from '@/lib/mermaid/schema';
import { callJson } from '@/lib/openai-client';

const EDGE_LABELS = 'causes, leads_to, computes, depends_on, configures, constrains, reads_from, writes_to, validates, triggers, emits';

export const OUTLINE_SYSTEM = [
  'You produce a MINIMAL JSON IR for a Mermaid flowchart. Return ONLY JSON that matches the provided schema.',
  '',
  'Constraints:',
  '- kind="flowchart"; direction in {TB,BT,LR,RL}; omit subgraphs at this stage.',
  '- Node ids: ^[A-Za-z_][A-Za-z0-9_]*$, ASCII, not reserved keywords.',
  '- Labels: ASCII <=60 chars; no commentary; keep short.',
  '- Shapes: use rect by default; only assign decision/terminator when unquestionably needed.',
  `- Edges: A --> B; edge labels optional but if used choose from ${EDGE_LABELS}.`,
  '- Style: omit unless caller budgets demand wrapLabelsAt.',
  '- Budget friendly: maxNodes and maxEdges are strict; produce spine of most critical steps only.',
  '- Preserve ids from input samples when refining; otherwise derive stable, semantic ids.',
  "- ABSOLUTE LABEL BAN LIST: Labels must not contain [, ], {, }, (, ), <, >, \" or ' characters. Rewrite these tokens (e.g., [→LB, ]→RB, remove quotes) before emitting.",
  '- No HTML in labels. Use line segmentation (see below) and let the compiler render multi-line labels.',
  '- Multi-line labels: emit as labelLines: string[] in the IR instead of embedding <br/>. Each line obeys the same ban list.',
  '- Preserve IDs; never inject shape tokens into labels.',
  '- If a label cannot be expressed without banned chars, drop the least important tokens first (by weight) until the ban holds.'
].join('\n');

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
    `Task: Produce a minimal flowchart IR for the TOPIC using only the most critical steps.`,
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
