import { callText } from '@/lib/openai-client';

export type MermaidRefinementInput = {
  model: string;
  lastSource: string;
  errorMessage: string;
  targetDiagramType: 'flowchart' | 'sequence' | 'class' | 'er' | 'state' | 'mindmap';
  maxTokens?: number;
  examples?: Array<{ error: string; invalid: string; fixed?: string }>;
};

export type MermaidRefinementOutput = {
  refinedSource: string;
  notes?: string;
};

const SYSTEM_PROMPT = `
You repair Mermaid v10 diagrams. Return Mermaid SOURCE ONLY (no backticks, no commentary).

Contract:
- Input: invalid mermaid source, exact parser error, target diagram type, and a few failure/correction examples.
- Output: corrected Mermaid source of the same diagram type.

Constraints:
- First line MUST be the diagram header (e.g., "flowchart TD").
- Preserve content/topology; do not invent nodes unless strictly required to fix syntax.
- ASCII-only punctuation; IDs are ASCII without spaces (n1, n2, a, b...).
- Human labels in brackets id["Label"], label length ≤ 60.
- Close every subgraph with end.
- Flowchart: edges A --> B only; avoid unsupported directives/themes.

Strict Syntax Rules (must follow exactly):
- Header must be first line: flowchart TD | sequenceDiagram | classDiagram | erDiagram | stateDiagram | mindmap.
- Edges: use A --> B (or -.->, ==>); DO NOT use A -> B.
- ASCII punctuation only; replace Unicode quotes/dashes/bullets.
 - Labels with punctuation MUST be quoted id["Label"] with BALANCED quotes; do NOT use backslash-escaped quotes (\\") inside labels. Prefer apostrophes (') if needed.
- Close every subgraph with end; never leave blocks open.
- Node IDs: ASCII, no spaces, not reserved (end, subgraph, graph, classDef, style, linkStyle, click, accTitle, accDescr, flowchart, sequenceDiagram, classDiagram, erDiagram, stateDiagram, mindmap).
- Keep labels concise (<=100 chars). If longer, shorten.
- No unsupported directives, themes, classes, or styles.
- No code fences; Mermaid only.

Reliability:
- Deterministic; low temperature set upstream.
- Never include code fences or explanations in output.
`.trim();

export function buildUserPrompt(input: MermaidRefinementInput): string {
  const header = [
    `Target diagram type: ${input.targetDiagramType}`
  ];

  const fewshots: string[] = [];
  if (input.examples && input.examples.length > 0) {
    fewshots.push('Previous parse errors and corrections:');
    input.examples.slice(-5).forEach((ex, idx) => {
      fewshots.push(
        `Example ${idx + 1}:\nError: ${ex.error}\nInvalid source:\n${ex.invalid}` +
          (ex.fixed ? `\nCorrected:\n${ex.fixed}` : '')
      );
    });
  }

  const current = [
    `Mermaid parser error: ${input.errorMessage}`,
    'Invalid source:',
    input.lastSource
  ];

  return [...header, ...fewshots, ...current].join('\n\n');
}

export async function refineWithLLM(input: MermaidRefinementInput): Promise<MermaidRefinementOutput> {
  if (!input.model) {
    throw new Error('Mermaid refiner model not configured');
  }

  const userPrompt = buildUserPrompt(input);
  const raw = await callText({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    model: input.model,
    temperature: 0,
    maxOutputTokens: input.maxTokens,
    agent: 'MermaidRefiner'
  });

  const refinedSource = raw.replace(/^\s*```[a-zA-Z0-9]*\s*/g, '').replace(/\s*```\s*$/g, '').trim();
  return { refinedSource };
}
