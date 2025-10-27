import { callText } from '@/lib/openai-client';

const SYSTEM = `
You minimize Mermaid v10 source to a smallest snippet that reproduces the same parser error. Output Mermaid ONLY (no backticks).
Rules:
- Keep the same diagram type.
- Preserve the specific syntax pattern causing the error.
- Remove unrelated nodes/edges.
`;

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

  const out = await callText({ system: SYSTEM, user, model, temperature: 0, agent: 'MermaidMinimizer' });
  return { minimal_source: out };
}
