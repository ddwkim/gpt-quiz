import { basicSanitize } from '@/lib/mermaid/sanitize';
import { refineWithLLM } from '@/lib/mermaid/refine';

const parsedRefinements = Number(
  process.env.NEXT_PUBLIC_MAX_MERMAID_REFINEMENTS ?? process.env.MAX_MERMAID_REFINEMENTS ?? ''
);
const MAX_REFINEMENTS = Number.isFinite(parsedRefinements) ? Math.max(0, parsedRefinements) : 5;

type DiagramType = 'flowchart' | 'sequence' | 'class' | 'er' | 'state' | 'mindmap';

let mermaidPromise: Promise<any> | null = null;
let initialized = false;

async function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => mod.default ?? mod);
  }
  const mermaid = await mermaidPromise;
  if (!initialized) {
    // Ensure consistent setup before parsing/rendering
    mermaid.initialize?.({ startOnLoad: false, theme: 'default' });
    initialized = true;
  }
  return mermaid;
}

export type RenderResult =
  | { ok: true; svg: string; source: string; iterations: number }
  | { ok: false; error: string; source: string; iterations: number };

export async function renderWithAutoRefine(
  original: string,
  type: DiagramType,
  modelForRefine?: string | null
): Promise<RenderResult> {
  const maxIterations = Math.max(0, MAX_REFINEMENTS);
  const mermaid = await loadMermaid();

  let src = basicSanitize(original);
  let lastError = '';
  let attempts = 0;

  for (let i = 0; i <= maxIterations; i += 1) {
    attempts = i;
    try {
      // parse throws on invalid syntax
      // @ts-ignore mermaid exposes parse at runtime
      mermaid.parse(src);
      const { svg } = await mermaid.render(`m-${Date.now()}-${i}`, src);
      return { ok: true, svg, source: src, iterations: i };
    } catch (err: any) {
      lastError = typeof err?.message === 'string' ? err.message : String(err);
      console.warn('[MERMAID_COMPILE_FAIL]', { iteration: i, error: lastError, snippet: src.slice(0, 200) });

      const hasRefiner = Boolean(modelForRefine && modelForRefine.trim().length > 0);
      if (i === maxIterations || !hasRefiner) {
        if (!hasRefiner && i < maxIterations) {
          lastError = `${lastError} (refiner model missing)`;
        }
        break;
      }

      try {
        const { refinedSource } = await refineWithLLM({
          model: modelForRefine!.trim(),
          lastSource: src,
          errorMessage: lastError,
          targetDiagramType: type,
          maxTokens: 1500
        });

        if (!refinedSource || refinedSource.trim().length < 4) {
          lastError = 'Mermaid refiner returned empty source';
          break;
        }

        src = basicSanitize(refinedSource);
      } catch (refineErr: any) {
        lastError = `Mermaid refinement failed: ${String(refineErr?.message ?? refineErr)}`;
        break;
      }
    }
  }

  return {
    ok: false,
    error: lastError || 'Unknown Mermaid parse error',
    source: src,
    iterations: attempts
  };
}
