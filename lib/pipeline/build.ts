import type { DiagramIR } from '@/lib/mermaid/schema';
import { compileToMermaid } from '@/lib/mermaid/compiler';
import { sanitizeMermaid, parseOnce, renderSVG } from '@/lib/mermaid/runtime';
import { generateIRFromSpec } from '@/lib/agents/ir_generate';
import { refineIRJSON, type Reason as RefineReason } from '@/lib/agents/ir_refine';
import { selectForFocus } from '@/lib/focus/select';
import type { FocusProfile } from '@/lib/types';
import { generateOutlineIR } from '@/lib/agents/diagram_outline';
import { expandIR } from '@/lib/agents/diagram_expand';
import { checkStaticMermaid } from '@/lib/mermaid/check';

const MODEL = process.env.MERMAID_MODEL || process.env.MERMAID_REFINER_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_ITERS = Number(process.env.MERMAID_MAX_ITERS ?? process.env.MAX_MERMAID_REFINES ?? 3);

export type Reason = RefineReason;
export type BuildOk = { ok: true; svg: string; mermaid: string; ir: DiagramIR; reasons: Reason[]; iterations: number };
export type BuildErr = { ok: false; error: string; lastMermaid: string; ir?: DiagramIR; reasons: Reason[]; iterations: number };

export async function buildMermaidFromSpec(spec: string, direction: 'TB' | 'BT' | 'LR' | 'RL' = 'TB'): Promise<BuildOk | BuildErr> {
  const reasons: Reason[] = [];
  let ir: DiagramIR | undefined;
  let mermaid = '';

  for (let i = 0; i <= MAX_ITERS; i++) {
    if (!ir) {
      ir = await generateIRFromSpec(spec, direction, MODEL);
    }

    mermaid = sanitizeMermaid(compileToMermaid(ir), `flowchart ${ir.direction}`);
    const parsed = await parseOnce(mermaid);

    if (parsed.ok) {
      const svg = await renderSVG(mermaid);
      return { ok: true, svg, mermaid, ir, reasons, iterations: i };
    }

    if (i === MAX_ITERS) {
      return { ok: false, error: parsed.error!, lastMermaid: mermaid, ir, reasons, iterations: i };
    }

    const reason = normalizeReason(parsed.error!);
    if (!reasons.find((r) => r.code === reason.code && r.message === reason.message)) {
      reasons.push(reason);
    }
    ir = await refineIRJSON(ir, parsed.error!, reasons, MODEL);
  }

  return { ok: false, error: 'unknown', lastMermaid: mermaid, ir, reasons, iterations: MAX_ITERS };
}

function normalizeReason(msg: string): Reason {
  const s = String(msg || '').toLowerCase();
  if (s.includes('no diagram type')) return { code: 'MISSING_HEADER', message: 'First line must be `flowchart <DIR>`.' };
  if (s.includes('expecting') && s.includes('end')) return { code: 'UNMATCHED_SUBGRAPH', message: 'A `subgraph` block is not closed with `end`.' };
  if (/[“”‘’…—–•]/.test(msg)) return { code: 'UNICODE_PUNCT', message: 'Replace smart quotes/dashes/bullets with ASCII.' };
  if (s.includes('unknown token') || s.includes('lexical')) return { code: 'UNKNOWN_TOKEN', message: 'Remove unsupported tokens and annotations.' };
  return { code: 'OTHER', message: msg.slice(0, 200) };
}

// Focus-aware builder: extracts relevant text, generates IR with budgets, enforces budgets, compiles and validates.
export async function buildMermaidFocused(fullTranscript: string, focus: FocusProfile): Promise<BuildOk | BuildErr> {
  const reasons: Reason[] = [];
  const direction = focus.direction ?? 'TB';
  const { excerpt, rationale } = selectForFocus(fullTranscript, focus);

  let ir: DiagramIR | undefined;
  let mermaid = '';

  // Stage 1: Coarse outline (simple syntax, tiny budgets)
  const outlineMaxN = Math.min(6, focus.maxNodes ?? 12);
  const outlineMaxE = Math.min(8, focus.maxEdges ?? Math.max(16, Math.round(1.5 * (focus.maxNodes ?? 12))));
  ir = await generateOutlineIR({
    topic: focus.topic,
    direction,
    excerpt,
    mustInclude: focus.mustInclude ?? [],
    exclude: focus.exclude ?? [],
    maxNodes: outlineMaxN,
    maxEdges: outlineMaxE
  }, MODEL);

  let iterations = 0;
  for (; iterations <= MAX_ITERS; iterations++) {
    // Enforce current budgets and validate
    ir = enforceBudgets(ir, focus);
    mermaid = sanitizeMermaid(compileToMermaid(ir), `flowchart ${direction}`);
    // Static preflight: avoid trivial parse errors (header, quotes, subgraphs, edges, unicode)
    const staticCk = checkStaticMermaid(mermaid, 'flowchart');
    if (!staticCk.ok) {
      const first = staticCk.issues[0];
      const fauxError = `${first.code}: ${first.message}${first.line ? ` (line ${first.line})` : ''}`;
      const reason = normalizeReason(fauxError);
      if (!reasons.find((r) => r.code === reason.code && r.message === reason.message)) reasons.push(reason);
      try {
        ir = await refineIRJSON(ir, fauxError, reasons, MODEL);
        continue;
      } catch {
        return { ok: false, error: fauxError, lastMermaid: mermaid, ir, reasons, iterations };
      }
    }
    const parsed = await parseOnce(mermaid);
    if (parsed.ok) {
      // If we still have expansion headroom, try to expand; else return
      const headroomNodes = (focus.maxNodes ?? 12) - (ir.nodes?.length ?? 0);
      const headroomEdges = (focus.maxEdges ?? Math.max(16, Math.round(1.5 * (focus.maxNodes ?? 12)))) - (ir.edges?.length ?? 0);
      const canExpand = headroomNodes > 0 || headroomEdges > 0;
      if (!canExpand || iterations === MAX_ITERS) {
        let svg = '';
        try { svg = await renderSVG(mermaid); } catch {}
        return { ok: true, svg, mermaid, ir, reasons, iterations };
      }

      // Stage 2: Coarse-to-fine expansion in small increments
      const targetN = Math.min((ir.nodes?.length ?? 0) + Math.ceil((focus.maxNodes ?? 12) / 3), focus.maxNodes ?? 12);
      const targetE = Math.min((ir.edges?.length ?? 0) + Math.ceil(((focus.maxEdges ?? 18)) / 3), focus.maxEdges ?? 18);
      const nextIR = await expandIR({
        currentIR: ir,
        targetMaxNodes: targetN,
        targetMaxEdges: targetE,
        preferGroups: true,
        preferEdgeLabels: true,
        mustInclude: focus.mustInclude ?? [],
        exclude: focus.exclude ?? [],
        depthHint: '2–3 layers',
        excerpt
      }, MODEL);
      ir = nextIR;
      continue;
    }
    // Parse failed: record reason and attempt IR refinement; if fails repeatedly, break
    const reason = normalizeReason(parsed.error!);
    if (!reasons.find((r) => r.code === reason.code && r.message === reason.message)) reasons.push(reason);
    try {
      ir = await refineIRJSON(ir, parsed.error!, reasons, MODEL);
    } catch {
      break;
    }
  }

  return { ok: false, error: 'Failed to produce a valid Mermaid after coarse-to-fine expansion', lastMermaid: mermaid, ir, reasons, iterations };
}

const IR_SYSTEM_FOCUS = `
You produce JSON IR for Mermaid flowcharts. Return JSON only (schema provided).
Rules:
- STRICTLY center content on the given TOPIC and MUST INCLUDE list.
- Respect HARD BUDGETS (drop lowest-importance items first; preserve MUST INCLUDE).
- IDs: ^[A-Za-z0-9_]+$; labels concise; may abbreviate; ASCII punctuation.
- Add "weight" (higher = more important to the TOPIC).
- Use "group" to cluster the most central nodes (caller may provide subgraph title).
- Prefer 2–3 layers of hierarchical detail; use edge labels to encode relation types (causes, leads_to, computes, depends_on, configures, constrains).
- Include concise formulas or decision rules as labels when they aid comprehension; keep within budgets.
`;

function enforceBudgets(ir: DiagramIR, focus: FocusProfile): DiagramIR {
  const maxN = focus.maxNodes ?? 12;
  const maxE = focus.maxEdges ?? Math.max(16, Math.round(1.5 * maxN));
  const mustIds = new Set((focus.mustInclude ?? []).map((s) => s.trim()).filter(Boolean));

  const nodesSorted = [...ir.nodes].sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));
  const keptNodes: typeof ir.nodes = [];
  for (const n of nodesSorted) {
    if (keptNodes.length < maxN || mustIds.has(n.id) || (n.label && mustIds.has(n.label))) keptNodes.push(n);
  }
  const keep = new Set(keptNodes.map((n) => n.id));

  const edgesFiltered = ir.edges.filter((e) => keep.has(e.from) && keep.has(e.to));
  const edgesSorted = edgesFiltered.sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));
  const keptEdges = edgesSorted.slice(0, maxE);

  return { ...ir, nodes: keptNodes, edges: keptEdges };
}
