import { callText } from '@/lib/openai-client';
import { loadPrompt } from '@/lib/prompts';

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

const mermaidRefineSystemPrompt = loadPrompt('mermaid-refine.system.md');

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
    system: mermaidRefineSystemPrompt,
    user: userPrompt,
    model: input.model,
    temperature: 0,
    maxOutputTokens: input.maxTokens,
    agent: 'MermaidRefiner'
  });

  const refinedSource = raw.replace(/^\s*```[a-zA-Z0-9]*\s*/g, '').replace(/\s*```\s*$/g, '').trim();
  return { refinedSource };
}
