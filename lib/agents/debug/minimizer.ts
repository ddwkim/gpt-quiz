import { callText } from '@/lib/openai-client';
import { loadPrompt } from '@/lib/prompts';

const minimizerSystemPrompt = loadPrompt('debug-minimizer.system.md');

export async function debugMinimize(
  model: string,
  type: 'flowchart' | 'sequence' | 'class' | 'er' | 'state' | 'mindmap',
  errorMessage: string,
  source: string
) {
  const user = [
    `Diagram type: ${type}`,
    `Parser error: ${errorMessage}`,
    `Source:`,
    source.slice(0, 2000)
  ].join('\n\n');

  const out = await callText({ system: minimizerSystemPrompt, user, model, temperature: 0, agent: 'MermaidMinimizer' });
  return { minimal_source: out };
}
