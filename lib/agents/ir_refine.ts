import { DiagramIRSchema, type DiagramIR } from '@/lib/mermaid/schema';
import { callJson } from '@/lib/openai-client';

const EDGE_LABELS = 'causes, leads_to, computes, depends_on, configures, constrains, reads_from, writes_to, validates, triggers, emits';
const RESERVED = 'end, subgraph, graph, classDef, style, linkStyle, click, accTitle, accDescr, flowchart, sequenceDiagram, classDiagram, erDiagram, stateDiagram, mindmap';

export const REFINE_SYSTEM = [
  'You correct invalid JSON IR for a Mermaid flowchart using the parser error and accumulated reasons[]. Return ONLY JSON that matches the provided schema.',
  '',
  'When refining:',
  "- Preserve the diagram's intent and focus; keep direction unchanged.",
  `- Maintain existing ids when they already match ^[A-Za-z_][A-Za-z0-9_]*$ and are not reserved (${RESERVED}). Rename only the offending ids.`,
  '- Labels: ASCII, <=60 chars, concise.',
  '- Node shapes limited to rect, decision, terminator, io, db, subroutine, stadium, circle, double_circle, hexagon, parallelogram, trap.',
  `- Edge labels optional; if present, must come from ${EDGE_LABELS}.`,
  '- Subgraphs: { title, nodeIds[] }; ensure titles ASCII (<=60 chars) and nodeIds reference defined nodes.',
  '- Style: wrapLabelsAt 12..60, nodeSpacing/rankSpacing 50..120, renderer in {dagre, elk}. Only set when explicitly helpful.',
  '- Weight: higher weight = more central; adjust only when necessary for budgets.',
  "- ABSOLUTE LABEL BAN LIST: Labels must not contain [, ], {, }, (, ), <, >, \" or '. Rewrite these tokens (e.g., [→LB, ]→RB, remove quotes) before emitting.",
  '- No HTML in labels. Use line segmentation (see below) and let the compiler render multi-line labels.',
  '- Multi-line labels: emit as labelLines: string[] in the IR instead of embedding <br/>. Each line obeys the same ban list.',
  '- Preserve IDs; never inject shape tokens into labels.',
  '- If a label cannot be expressed without banned chars, drop the least important tokens first (by weight) until the ban holds.',
  "- If the parser error references tokens like SUBROUTINEEND, ]] or TAG*, or mentions ]/}} near a node, treat it as TOKEN/CLOSER_IN_LABEL: strip banned characters from labels and/or switch the node's shape to a safe alternative. Do not change the graph structure.",
  '- Do not reintroduce reasons listed in reasons[].',
  '- Deterministic output; no commentary, Markdown, or Mermaid strings.'
].join('\n');

export type Reason = { code: string; message: string };

export function buildRefineUserPrompt(badIR: string, parserError: string, reasons: Reason[]) {
  return [
    'Here is the last IR (JSON):',
    badIR,
    'Mermaid parser error message:',
    parserError,
    'Accumulated reasons to avoid (oldest->newest):',
    JSON.stringify(reasons, null, 2),
    'Return corrected IR JSON only.'
  ].join('\n\n');
}

export async function refineIRJSON(
  badIR: any,
  parserError: string,
  reasons: Reason[],
  model?: string
): Promise<DiagramIR> {
  const user = buildRefineUserPrompt(JSON.stringify(badIR), parserError, reasons);
  const ir = await callJson<DiagramIR>({
    system: REFINE_SYSTEM,
    user,
    schema: DiagramIRSchema,
    model,
    parser: { parse: (x: any) => x } as any,
    agent: 'IR_Refine'
  });
  return ir;
}
