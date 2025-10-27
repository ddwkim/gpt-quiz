import { callJson } from '@/lib/openai-client';

const ClassifierSchema = {
  name: 'mermaid_error_classifier',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      category: {
        type: 'string',
        enum: [
          'MISSING_HEADER',
          'UNCLOSED_SUBGRAPH',
          'UNQUOTED_LABEL_PUNCT',
          'ID_WITH_SPACES',
          'INVALID_EDGE_SYNTAX',
          'RESERVED_KEYWORD',
          'UNSUPPORTED_DIRECTIVE',
          'UNKNOWN_TOKEN',
          'UNICODE_PUNCT',
          'TOO_LONG_LABEL',
          'OTHER'
        ]
      },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      summary: { type: 'string' },
      suggestions: { type: 'array', items: { type: 'string' } }
    },
    required: ['category', 'confidence', 'summary', 'suggestions']
  }
} as const;

const SYSTEM = `
You classify Mermaid v10 parse errors. Return ONLY JSON following the schema.
Policy:
- Use conservative categories. Prefer OTHER when unsure.
- Summarize briefly. Suggestions must be actionable and syntax-safe.
`; 

export async function debugClassify(
  model: string,
  type: 'flowchart' | 'sequence' | 'class' | 'er' | 'state' | 'mindmap',
  errorMessage: string,
  source: string
) {
  const snippet = source.slice(0, 2000);
  const user = [
    `Diagram type: ${type}`,
    `Parser error: ${errorMessage}`,
    `Source:`,
    snippet
  ].join('\n\n');

  const out = await callJson({
    system: SYSTEM,
    user,
    schema: ClassifierSchema,
    model,
    parser: { parse: (x: any) => x } as any,
    agent: 'MermaidErrorClassifier',
    temperature: 0.0
  });
  return out as { category: string; confidence: string; summary: string; suggestions: string[] };
}
