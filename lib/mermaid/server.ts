import { basicSanitize } from '@/lib/mermaid/sanitize';
import { refineWithLLM } from '@/lib/mermaid/refine';
import { listFewShots, recordFewShot } from '@/lib/mermaid/memory';
import { checkStaticMermaid } from '@/lib/mermaid/check';

type DiagramType = 'flowchart' | 'sequence' | 'class' | 'er' | 'state' | 'mindmap';

let mermaidPromise: Promise<any> | null = null;
let initialized = false;

async function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod: any) => mod.default ?? mod);
  }
  const mermaid = await mermaidPromise;
  if (!initialized) {
    try {
      mermaid.initialize?.({ startOnLoad: false, theme: 'default' });
    } catch {
      // Ignore SSR initialization errors
    }
    initialized = true;
  }
  return mermaid;
}

const parsedRefinements = Number(
  process.env.MAX_MERMAID_REFINEMENTS ??
    process.env.MERMAID_MAX_REFINES ??
    process.env.NEXT_PUBLIC_MAX_MERMAID_REFINEMENTS ??
    ''
);
const MAX_REFINEMENTS = Number.isFinite(parsedRefinements) ? Math.max(0, parsedRefinements) : 5;
const DEFAULT_REFINER_MODEL =
  process.env.MERMAID_REFINER_MODEL ||
  process.env.MERMAID_MODEL ||
  process.env.OPENAI_DIAGRAM_MODEL ||
  process.env.OPENAI_MODEL ||
  'gpt-5-2025-08-07';

function stripFences(s: string) {
  return s.replace(/^\s*```(?:mermaid)?\s*/i, '').replace(/\s*```\s*$/i, '');
}

function headerForType(type: DiagramType): string {
  switch (type) {
    case 'flowchart':
      return 'flowchart TD';
    case 'sequence':
      return 'sequenceDiagram';
    case 'class':
      return 'classDiagram';
    case 'er':
      return 'erDiagram';
    case 'state':
      return 'stateDiagram';
    case 'mindmap':
      return 'mindmap';
    default:
      return 'flowchart TD';
  }
}

function ensureHeader(src: string, type: DiagramType): string {
  const cleaned = stripFences(src).trimStart();
  const headerRe = /^(flowchart|graph|sequenceDiagram|classDiagram|erDiagram|stateDiagram|mindmap)\b/;
  if (headerRe.test(cleaned)) return cleaned;
  return headerForType(type) + '\n' + cleaned;
}

export type ServerRefineResult =
  | { ok: true; source: string; svg?: string; iterations: number; debug?: any }
  | { ok: false; source: string; error: string; iterations: number; debug?: any };

export async function refineMermaidOnServer(
  original: string,
  type: DiagramType,
  modelForRefine: string = DEFAULT_REFINER_MODEL
): Promise<ServerRefineResult> {
  const mermaid = await loadMermaid();
  let src = ensureHeader(basicSanitize(original), type);
  let lastError = '';
  const debugEnabled = String(process.env.MERMAID_DEBUG_AGENTS ?? 'true').toLowerCase() !== 'false';
  const debugModel = process.env.MERMAID_REFINER_MODEL || process.env.OPENAI_MODEL || 'gpt-5-2025-08-07';
  let debugPayload: any = undefined;

  for (let i = 0; i <= MAX_REFINEMENTS; i++) {
    try {
      // Static preflight: simple syntax checks (header, quotes, subgraphs, edges, unicode)
      const staticCk = checkStaticMermaid(src, type);
      if (!staticCk.ok) {
        const first = staticCk.issues[0];
        throw new Error(`${first.code}: ${first.message}${first.line ? ` (line ${first.line})` : ''}`);
      }
      // Validate with parse
      // @ts-ignore parse exists at runtime
      mermaid.parse(src);
      // Try to render to SVG if possible; ignore if DOM missing
      try {
        const { svg } = await mermaid.render?.(`m-ssr-${Date.now()}-${i}`, src);
        return { ok: true, source: src, svg, iterations: i };
      } catch {
        return { ok: true, source: src, iterations: i };
      }
    } catch (e: any) {
      lastError = String(e?.message ?? e);
      if (i === MAX_REFINEMENTS) break;

      // Ask refiner to fix based on the error
      try {
        const examples = listFewShots(type, Number(process.env.MERMAID_FEWSHOT_MAX ?? 4)).map((e) => ({
          error: e.error,
          invalid: e.invalid,
          fixed: e.fixed
        }));

        const { refinedSource } = await refineWithLLM({
          model: modelForRefine,
          lastSource: src,
          errorMessage: lastError,
          targetDiagramType: type as any,
          maxTokens: 1500,
          examples
        });
        if (!refinedSource || refinedSource.trim().length < 4) {
          break;
        }
        const candidate = ensureHeader(basicSanitize(refinedSource), type);
        // Record this failure + candidate for future few-shots
        recordFewShot({ type, error: lastError, invalid: src, fixed: candidate });
        src = candidate;
      } catch (err: any) {
        lastError = `Refiner failed: ${String(err?.message ?? err)}`;
        break;
      }
    }
  }

  // Run debug agents to enrich diagnostics if enabled
  if (debugEnabled) {
    try {
      const { debugClassify } = await import('@/lib/agents/debug/classifier');
      const { debugLint } = await import('@/lib/agents/debug/linter');
      const { debugMinimize } = await import('@/lib/agents/debug/minimizer');
      const [cls, lint, min] = await Promise.all([
        debugClassify(debugModel, type as any, lastError, src),
        debugLint(debugModel, type as any, src),
        debugMinimize(debugModel, type as any, lastError, src)
      ]);
      debugPayload = { classifier: cls, lints: lint?.issues ?? [], minimal: min?.minimal_source };
    } catch (e: any) {
      debugPayload = { error: String(e?.message ?? e) };
    }
  }

  return { ok: false, source: original, error: lastError || 'Unknown Mermaid parse error', iterations: MAX_REFINEMENTS, debug: debugPayload };
}
