import { DiagramIRSchema, type DiagramIR } from '@/lib/mermaid/schema';
import { callJson } from '@/lib/openai-client';

const EDGE_LABELS = 'causes, leads_to, computes, depends_on, configures, constrains, reads_from, writes_to, validates, triggers, emits';

export const IR_SYSTEM = [
  'You generate JSON IR for a Mermaid flowchart (not Mermaid text). Return ONLY strict JSON that matches the provided schema.',
  '',
  'Hard requirements:',
  '- kind="flowchart"; direction in {TB,BT,LR,RL}.',
  '- Node ids: ^[A-Za-z_][A-Za-z0-9_]*$, ASCII only, not reserved keywords (end, subgraph, graph, classDef, style, linkStyle, click, accTitle, accDescr, flowchart, sequenceDiagram, classDiagram, erDiagram, stateDiagram, mindmap).',
  '- Labels: ASCII, <=60 chars, concise; trim filler like "Step" or "Process".',
  `- Shapes: choose from rect, decision, terminator, io, db, subroutine, stadium, circle, double_circle, hexagon, parallelogram, trap.`,
  `- Edge labels optional; if provided, use whitelist (${EDGE_LABELS}).`,
  '- Subgraphs (optional): { title, nodeIds[] } with title ASCII <=60 chars, nodeIds referencing existing nodes.',
  '- Style (optional): wrapLabelsAt (12..60), nodeSpacing/rankSpacing (50..120), renderer in {dagre, elk}.',
  '- Preserve existing ids when refining upstream output unless invalid.',
  '- Include weight to rank importance (higher = more central). Use group to cluster related nodes.',
  "- ABSOLUTE LABEL BAN LIST: Labels must not contain [, ], {, }, (, ), <, >, \" or ' characters. Rewrite these tokens (e.g., [→LB, ]→RB, remove quotes) before emitting.",
  '- No HTML in labels. Use line segmentation (see below) and let the compiler render multi-line labels.',
  '- Multi-line labels: emit as labelLines: string[] in the IR instead of embedding <br/>. Each line obeys the same ban list.',
  '- Preserve IDs; never inject shape tokens into labels.',
  '- If a label cannot be expressed without banned chars, drop the least important tokens first (by weight) until the ban holds.',
  '',
  'Reliability:',
  '- Deterministic ordering; prefer most important nodes first.',
  '- No comments, prose, code fences, or Mermaid.'
].join('\n');

export function buildIRUserPrompt(spec: string, direction: 'TB' | 'BT' | 'LR' | 'RL') {
  return [`Task: derive a semantic flowchart IR from the following spec.`, `Direction: ${direction}`, `Spec:\n${spec}`].join('\n\n');
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
    `Task: Build a flowchart IR centered on the TOPIC and constraints below. Respect budgets and schema invariants.`,
    `TOPIC: ${focus.topic}`,
    `MUST INCLUDE (as nodes or explicit labels): ${include}`,
    `EXCLUDE (omit from nodes and labels): ${exclude}`,
    `HARD BUDGETS: maxNodes=${maxN}, maxEdges=${maxE}`,
    `DIRECTION: ${dir}`,
    `Shapes: choose semantic shapes from the whitelist; leave unset when default rectangle is fine.`,
    `Edge labels: optional; if used, choose from ${EDGE_LABELS}.`,
    `Weight: prioritize central causal steps and decisions; higher weight = more critical.`,
    `Group: cluster major subsystems; caller may map groups to subgraphs.`,
    `Budget policy: preserve mustInclude + decision nodes; drop lowest-weight off-topic items first.`,
    `SOURCE EXCERPT (filtered for relevance):`,
    transcriptExcerpt
  ].join('\n');
}
