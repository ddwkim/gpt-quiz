import type { DiagramIR, Direction, MultiDiagramPack } from '@/lib/mermaid/schema';
import { compileToMermaid } from '@/lib/mermaid/compiler';
import { sanitizeMermaid } from '@/lib/mermaid/runtime';
import { validateMermaid } from '@/lib/mermaid/validate';
import { checkStaticMermaid, type StaticIssue } from '@/lib/mermaid/check';
import { fixByToken, fixByArity, fixByBlock, fixTokenIssues } from '@/lib/mermaid/mutators';
import { generateIRFromSpec } from '@/lib/agents/ir_generate';
import { refineIRJSON, type Reason as RefineReason } from '@/lib/agents/ir_refine';
import { selectForFocus } from '@/lib/focus/select';
import type { FocusProfile } from '@/lib/types';
import { generateOutlineIR } from '@/lib/agents/diagram_outline';
import { expandIR } from '@/lib/agents/diagram_expand';
import { emitDiagramMetrics } from '@/lib/metrics/telemetry';
import mermaidPkg from 'mermaid/package.json';
import { performance } from 'node:perf_hooks';
import { canonicalizeIR, sanitizeId } from '@/lib/ir/canonicalize';
import { partitionIR, type PartitionMode } from './partition';
import type { IR } from '@/lib/ir/schema';

const MODEL = process.env.MERMAID_MODEL || process.env.MERMAID_REFINER_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_ITERS = Number(process.env.MERMAID_MAX_ITERS ?? process.env.MAX_MERMAID_REFINES ?? 3);
const DEFAULT_WRAP = Number(process.env.MERMAID_LABEL_WRAP ?? 44);
const APP_VERSION = process.env.APP_VERSION || 'dev';
const MERMAID_VERSION = (mermaidPkg as { version?: string }).version ?? 'unknown';

export type Reason = RefineReason;

export interface SplitSettings {
  mode: PartitionMode;
  maxNodes: number;
  maxEdges: number;
  targetDensity?: number;
  maxBridges?: number;
  k?: number;
}

export interface BuildOptions {
  direction?: Direction;
  split?: SplitSettings;
}

export type CompiledDiagram = { index: number; mermaid: string; svg?: string };
export type BuildOk = { ok: true; pack: MultiDiagramPack; diagrams: CompiledDiagram[]; reasons: Reason[]; iterations: number };
export type BuildErr = { ok: false; error: string; lastMermaid: string; ir?: DiagramIR; reasons: Reason[]; iterations: number };

type Renderer = 'dagre' | 'elk';

type CompileResult = {
  mermaid: string;
  compileMs: number;
  parseMs: number;
  validation: { ok: true; type: string } | { ok: false; message: string };
};

type SolveResult =
  | { ok: true; ir: DiagramIR; mermaid: string; iterations: number; compileMs: number; parseMs: number; renderer: Renderer }
  | { ok: false; ir: DiagramIR; mermaid: string; iterations: number; compileMs: number; parseMs: number; renderer: Renderer; error: string };

type BudgetEnforcer = (ir: DiagramIR) => DiagramIR;

type SolveOptions = {
  model: string;
  maxRefine: number;
  reasons: Reason[];
  enforceBudgets?: BudgetEnforcer;
};

const DEFAULT_SPLIT: SplitSettings = {
  mode: 'none',
  maxNodes: 18,
  maxEdges: 22,
  targetDensity: 1.1,
  maxBridges: 6
};

function normalizeSplit(split?: SplitSettings): SplitSettings {
  if (!split) return { ...DEFAULT_SPLIT };
  return {
    mode: split.mode ?? 'none',
    maxNodes: Math.max(4, split.maxNodes || DEFAULT_SPLIT.maxNodes),
    maxEdges: Math.max(4, split.maxEdges || DEFAULT_SPLIT.maxEdges),
    targetDensity: split.targetDensity ?? DEFAULT_SPLIT.targetDensity,
    maxBridges: split.maxBridges ?? DEFAULT_SPLIT.maxBridges,
    k: split.k
  };
}

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function chooseRenderer(ir: DiagramIR): Renderer {
  const nodes = ir.nodes.length;
  const edges = ir.edges.length;
  const density = edges / Math.max(1, nodes);
  if (ir.style?.renderer) return ir.style.renderer;
  if (process.env.MERMAID_FORCE_DAGRE === 'true') return 'dagre';
  return nodes >= 25 || density > 1.2 ? 'elk' : 'dagre';
}

async function compileAndValidate(ir: DiagramIR): Promise<CompileResult> {
  const header = `flowchart ${ir.direction}`;
  const compileStart = performance.now();
  const source = compileToMermaid(ir);
  const compileMs = performance.now() - compileStart;
  const wrap = ir.style?.wrapLabelsAt ?? DEFAULT_WRAP;
  const mermaid = sanitizeMermaid(source, header, wrap);
  const parseStart = performance.now();
  const validation = await validateMermaid(mermaid);
  const parseMs = performance.now() - parseStart;
  return { mermaid, compileMs, parseMs, validation };
}

function applyStaticRepairs(
  ir: DiagramIR,
  issues: StaticIssue[],
  options: { skipTokenLabelFix?: boolean } = {}
): { ir: DiagramIR; applied: string[] } {
  let next = ir;
  const applied: string[] = [];
  const seen = new Set<string>();
  for (const issue of issues) {
    if (
      !options.skipTokenLabelFix &&
      (issue.code === 'TOKEN/CLOSER_IN_LABEL' ||
        issue.code === 'TOKEN/HTML_IN_LABEL' ||
        issue.code === 'TOKEN/QUOTE_NOISE') &&
      !seen.has('label')
    ) {
      next = fixTokenIssues(next);
      applied.push(issue.code);
      seen.add('label');
      continue;
    }
    if (issue.code.startsWith('TOKEN/') && !seen.has('token')) {
      next = fixByToken(next);
      applied.push(issue.code);
      seen.add('token');
      continue;
    }
    if (issue.code === 'ARITY/ORPHAN_EDGE' && !seen.has('arity')) {
      next = fixByArity(next);
      applied.push(issue.code);
      seen.add('arity');
      continue;
    }
    if (issue.code === 'BLOCK/UNBALANCED' && !seen.has('block')) {
      next = fixByBlock(next);
      applied.push(issue.code);
      seen.add('block');
    }
  }
  return { ir: next, applied };
}

function normalizeParseReason(message: string): Reason {
  const lower = message.toLowerCase();
  if (lower.includes('no diagram type')) {
    return { code: 'HEADER/MISSING', message: 'First line must be `flowchart <DIR>`' };
  }
  if (
    lower.includes('subroutineend') ||
    /\]\]/.test(message) ||
    lower.includes('tagstart') ||
    lower.includes('tagend') ||
    lower.includes('unicodetext') ||
    lower.includes('closer')
  ) {
    return { code: 'TOKEN/CLOSER_IN_LABEL', message: 'Label contains banned bracket/HTML tokens; sanitize or change shape.' };
  }
  if (/<br/.test(lower) || lower.includes('html')) {
    return { code: 'TOKEN/HTML_IN_LABEL', message: 'Remove HTML-like content (e.g., <br/>) from labels.' };
  }
  if (lower.includes('lexical') || lower.includes('token')) {
    return { code: 'TOKEN/UNKNOWN', message: message.slice(0, 160) };
  }
  if (lower.includes('expecting') && lower.includes('end')) {
    return { code: 'BLOCK/UNBALANCED', message: 'A `subgraph` block is not closed with `end`.' };
  }
  if (/[“”‘’…—–•]/.test(message)) {
    return { code: 'TOKEN/UNICODE', message: 'Unicode punctuation detected; replace with ASCII equivalents.' };
  }
  return { code: 'PARSE/UNKNOWN', message: message.slice(0, 200) };
}

function normalizeIssueReason(issue: StaticIssue): Reason {
  return { code: issue.code, message: issue.message };
}

function pushReason(list: Reason[], reason: Reason) {
  if (!reason.code) return;
  const exists = list.some((r) => r.code === reason.code && r.message === reason.message);
  if (!exists) list.push(reason);
}

function aggregateReasons(reasons: Reason[]) {
  const counts = new Map<string, number>();
  for (const r of reasons) counts.set(r.code, (counts.get(r.code) ?? 0) + 1);
  return Array.from(counts.entries()).map(([code, count]) => ({ code, count }));
}

function emitMetrics(ir: DiagramIR, reasons: Reason[], iterations: number, renderer: Renderer, compileMs: number, parseMs: number) {
  const nodes = ir.nodes.length;
  const edges = ir.edges.length;
  const density = edges / Math.max(1, nodes);
  emitDiagramMetrics({
    iters: iterations + 1,
    reasons: aggregateReasons(reasons),
    nodes,
    edges,
    density,
    renderer,
    parseMs,
    compileMs,
    version: { mermaid: MERMAID_VERSION, app: APP_VERSION }
  });
}

function materializeMustInclude(ir: DiagramIR, mustInclude: string[] = []): DiagramIR {
  if (!mustInclude.length) return ir;
  const next = clone(ir);
  const byId = new Set(next.nodes.map((n) => n.id.toLowerCase()));
  const byLabel = new Set(next.nodes.map((n) => (n.label ?? '').toLowerCase()));
  let suffix = 0;
  for (const raw of mustInclude) {
    const term = raw.trim();
    if (!term) continue;
    const lower = term.toLowerCase();
    if (byId.has(lower) || byLabel.has(lower)) continue;
    let candidate = sanitizeId(term.slice(0, 40));
    while (byId.has(candidate.toLowerCase())) {
      candidate = `${candidate}_${suffix++}`;
    }
    const label = term.slice(0, 60);
    next.nodes.push({ id: candidate, label, labelLines: [label], weight: 100, shape: 'rect' });
    byId.add(candidate.toLowerCase());
    byLabel.add(lower);
  }
  return next;
}

function computeDegree(ir: DiagramIR): Map<string, number> {
  const degree = new Map<string, number>();
  for (const node of ir.nodes) degree.set(node.id, 0);
  for (const edge of ir.edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }
  return degree;
}

function enforceBudgets(ir: DiagramIR, maxNodes: number, maxEdges: number, mustInclude: string[] = []): DiagramIR {
  if (ir.nodes.length <= maxNodes && ir.edges.length <= maxEdges) return ir;
  const next = clone(ir);
  const mustSet = new Set(mustInclude.map((s) => s.toLowerCase()));
  const degree = computeDegree(next);
  const keep = new Set<string>();
  for (const node of next.nodes) {
    if (mustSet.has((node.id ?? '').toLowerCase()) || mustSet.has((node.label ?? '').toLowerCase())) keep.add(node.id);
    if (node.shape === 'decision') keep.add(node.id);
    if ((degree.get(node.id) ?? 0) >= 4) keep.add(node.id);
  }
  if (next.nodes.length > maxNodes) {
    const sorted = [...next.nodes].sort((a, b) => (a.weight ?? 0) - (b.weight ?? 0) || a.id.localeCompare(b.id));
    for (const node of sorted) {
      if (next.nodes.length <= maxNodes) break;
      if (keep.has(node.id)) continue;
      const lowerLabel = (node.label ?? '').toLowerCase();
      if (mustSet.has(lowerLabel)) {
        keep.add(node.id);
        continue;
      }
      const idx = next.nodes.findIndex((n) => n.id === node.id);
      if (idx >= 0) next.nodes.splice(idx, 1);
    }
  }
  const allowed = new Set(next.nodes.map((n) => n.id));
  next.edges = next.edges.filter((e) => allowed.has(e.from) && allowed.has(e.to));
  if (next.edges.length > maxEdges) {
    const prioritized = [...next.edges].sort((a, b) => {
      const scoreA = (a.kind ? 2 : 0) + (a.label ? 1 : 0);
      const scoreB = (b.kind ? 2 : 0) + (b.label ? 1 : 0);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return (degree.get(b.from) ?? 0) - (degree.get(a.from) ?? 0);
    });
    next.edges = prioritized.slice(0, maxEdges);
  }
  if (next.subgraphs) {
    next.subgraphs = next.subgraphs
      .map((sg) => ({ title: sg.title, nodeIds: sg.nodeIds.filter((id) => allowed.has(id)) }))
      .filter((sg) => sg.nodeIds.length >= 2);
  }
  return next;
}

function createBudgetEnforcer(focus: FocusProfile): BudgetEnforcer {
  const maxNodes = focus.maxNodes ?? 12;
  const maxEdges = focus.maxEdges ?? Math.max(16, Math.round(1.5 * maxNodes));
  return (ir: DiagramIR) => enforceBudgets(materializeMustInclude(ir, focus.mustInclude ?? []), maxNodes, maxEdges, focus.mustInclude ?? []);
}

async function solveDiagram(initialIR: DiagramIR, options: SolveOptions): Promise<SolveResult> {
  const reasons = options.reasons;
  let working = clone(initialIR);
  let attempt = 0;
  let lastMermaid = '';
  let compileMs = 0;
  let parseMs = 0;
  let renderer: Renderer = 'dagre';
  let lastError = '';

  while (attempt <= options.maxRefine) {
    if (options.enforceBudgets) {
      working = options.enforceBudgets(working);
    }
    const canonical = canonicalizeIR(clone(working));
    renderer = chooseRenderer(canonical);
    const result = await compileAndValidate(canonical);
    lastMermaid = result.mermaid;
    compileMs = result.compileMs;
    parseMs = result.parseMs;

    if (result.validation.ok) {
      return { ok: true, ir: canonical, mermaid: lastMermaid, iterations: attempt, compileMs, parseMs, renderer };
    }

    lastError = result.validation.message;
    const parseReason = normalizeParseReason(lastError);
    pushReason(reasons, parseReason);
    let needsTokenFix =
      parseReason.code === 'TOKEN/CLOSER_IN_LABEL' ||
      parseReason.code === 'TOKEN/HTML_IN_LABEL' ||
      parseReason.code === 'TOKEN/QUOTE_NOISE';
    const lint = checkStaticMermaid(lastMermaid, 'flowchart');
    for (const issue of lint.issues) {
      pushReason(reasons, normalizeIssueReason(issue));
      if (
        issue.code === 'TOKEN/CLOSER_IN_LABEL' ||
        issue.code === 'TOKEN/HTML_IN_LABEL' ||
        issue.code === 'TOKEN/QUOTE_NOISE'
      ) {
        needsTokenFix = true;
      }
    }

    let tokenAttempted = false;
    if (needsTokenFix) {
      tokenAttempted = true;
      const before = JSON.stringify(canonical);
      const tokenFixed = fixTokenIssues(canonical);
      const after = JSON.stringify(tokenFixed);
      if (after !== before) {
        working = tokenFixed;
        continue;
      }
    }

    const { ir: mutated, applied } = applyStaticRepairs(canonical, lint.issues, { skipTokenLabelFix: tokenAttempted });
    if (applied.length > 0) {
      working = mutated;
      continue;
    }

    if (attempt === options.maxRefine) break;
    const refined = await refineIRJSON(canonical, lastError, reasons, options.model);
    working = refined;
    attempt += 1;
  }

  return { ok: false, ir: working, mermaid: lastMermaid, iterations: attempt, compileMs, parseMs, renderer, error: lastError || 'Unknown Mermaid parse error' };
}

function mapSplitToPartition(split: SplitSettings): { mode: PartitionMode; count?: number } & { budgets: { maxNodes: number; maxEdges: number; targetDensity?: number; maxBridges?: number } } {
  return {
    mode: split.mode,
    count: split.mode === 'byCount' ? split.k : undefined,
    budgets: {
      maxNodes: split.maxNodes,
      maxEdges: split.maxEdges,
      targetDensity: split.targetDensity,
      maxBridges: split.maxBridges
    }
  };
}

async function finalizePack(ir: DiagramIR, split: SplitSettings): Promise<{ ok: true; pack: MultiDiagramPack; compiled: CompiledDiagram[]; aggregateCompileMs: number; aggregateParseMs: number } | { ok: false; error: string; lastMermaid: string }>
{
  const partitionOptions = mapSplitToPartition(split);
  const pack = partitionIR(ir, partitionOptions);
  const compiled: CompiledDiagram[] = [];
  let totalCompile = 0;
  let totalParse = 0;

  for (const unit of pack.diagrams) {
    const result = await compileAndValidate(unit.ir);
    totalCompile += result.compileMs;
    totalParse += result.parseMs;
    if (!result.validation.ok) {
      return { ok: false, error: result.validation.message, lastMermaid: result.mermaid };
    }
    compiled.push({ index: unit.index, mermaid: result.mermaid });
    unit.mermaid = result.mermaid;
  }

  return { ok: true, pack, compiled, aggregateCompileMs: totalCompile, aggregateParseMs: totalParse };
}

export async function buildMermaidFromSpec(spec: string, options?: BuildOptions): Promise<BuildOk | BuildErr> {
  const split = normalizeSplit(options?.split);
  const direction: Direction = options?.direction ?? 'TB';
  const reasons: Reason[] = [];
  let ir: DiagramIR | undefined;
  let lastMermaid = '';

  try {
    ir = await generateIRFromSpec(spec, direction, MODEL);
  } catch (error: any) {
    return { ok: false, error: String(error?.message ?? error), lastMermaid: '', reasons, iterations: 0 };
  }

  const solve = await solveDiagram(ir, { model: MODEL, maxRefine: MAX_ITERS, reasons });
  if (!solve.ok) {
    return { ok: false, error: solve.error, lastMermaid: solve.mermaid, ir: solve.ir, reasons, iterations: solve.iterations };
  }

  const final = await finalizePack(solve.ir, split);
  if (!final.ok) {
    return { ok: false, error: final.error, lastMermaid: final.lastMermaid, ir: solve.ir, reasons, iterations: solve.iterations };
  }

  emitMetrics(solve.ir, reasons, solve.iterations, solve.renderer, solve.compileMs + final.aggregateCompileMs, solve.parseMs + final.aggregateParseMs);
  return { ok: true, pack: final.pack, diagrams: final.compiled, reasons, iterations: solve.iterations };
}

export async function buildMermaidFocused(fullTranscript: string, focus: FocusProfile, splitOverride?: SplitSettings): Promise<BuildOk | BuildErr> {
  const reasons: Reason[] = [];
  const direction = focus.direction ?? 'TB';
  const split = normalizeSplit(splitOverride);
  const { excerpt } = selectForFocus(fullTranscript, focus);
  const outlineMaxN = Math.min(6, focus.maxNodes ?? 12);
  const outlineMaxE = Math.min(8, focus.maxEdges ?? Math.max(16, Math.round(1.5 * (focus.maxNodes ?? 12))));

  let outline: DiagramIR;
  try {
    outline = await generateOutlineIR(
      {
        topic: focus.topic,
        direction,
        excerpt,
        mustInclude: focus.mustInclude ?? [],
        exclude: focus.exclude ?? [],
        maxNodes: outlineMaxN,
        maxEdges: outlineMaxE
      },
      MODEL
    );
  } catch (error: any) {
    return { ok: false, error: String(error?.message ?? error), lastMermaid: '', reasons, iterations: 0 };
  }

  const enforce = createBudgetEnforcer(focus);
  let available = MAX_ITERS;
  let working = outline;
  let totalIterations = 0;

  while (available >= 0) {
    const solved = await solveDiagram(working, { model: MODEL, maxRefine: available, reasons, enforceBudgets: enforce });
    totalIterations += solved.iterations;
    available = MAX_ITERS - totalIterations;

    if (!solved.ok) {
      return { ok: false, error: solved.error, lastMermaid: solved.mermaid, ir: solved.ir, reasons, iterations: totalIterations };
    }

    const headroomNodes = (focus.maxNodes ?? 12) - solved.ir.nodes.length;
    const headroomEdges = (focus.maxEdges ?? Math.max(16, Math.round(1.5 * (focus.maxNodes ?? 12)))) - solved.ir.edges.length;
    const canExpand = headroomNodes > 0 || headroomEdges > 0;

    if (!canExpand || available <= 0) {
      const final = await finalizePack(solved.ir, split);
      if (!final.ok) {
        return { ok: false, error: final.error, lastMermaid: final.lastMermaid, ir: solved.ir, reasons, iterations: totalIterations };
      }
      emitMetrics(solved.ir, reasons, totalIterations, solved.renderer, solved.compileMs + final.aggregateCompileMs, solved.parseMs + final.aggregateParseMs);
      return { ok: true, pack: final.pack, diagrams: final.compiled, reasons, iterations: totalIterations };
    }

    const targetN = Math.min(solved.ir.nodes.length + Math.ceil((focus.maxNodes ?? 12) / 3), focus.maxNodes ?? 12);
    const targetE = Math.min(solved.ir.edges.length + Math.ceil((focus.maxEdges ?? 18) / 3), focus.maxEdges ?? 18);
    working = await expandIR(
      {
        currentIR: solved.ir,
        targetMaxNodes: targetN,
        targetMaxEdges: targetE,
        preferGroups: true,
        preferEdgeLabels: true,
        mustInclude: focus.mustInclude ?? [],
        exclude: focus.exclude ?? [],
        depthHint: '2-3 layers',
        excerpt
      },
      MODEL
    );
  }

  return { ok: false, error: 'Focus build exhausted refinement budget', lastMermaid: '', ir: canonicalizeIR(working), reasons, iterations: totalIterations };
}
