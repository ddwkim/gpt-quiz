import { callJson } from '@/lib/openai-client';

const LintSchema = {
  name: 'mermaid_lints',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      issues: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
            severity: { type: 'string', enum: ['low', 'medium', 'high'] },
            fix: {
              type: 'object',
              additionalProperties: false,
              properties: {
                action: {
                  type: 'string',
                  enum: [
                    'add_header',
                    'quote_label',
                    'replace_unicode',
                    'close_subgraph',
                    'edge_syntax',
                    'rename_id',
                    'remove_directive',
                    'shorten_label',
                    'other'
                  ]
                },
                example: { type: 'string' }
              },
              required: ['action']
            }
          },
          required: ['code', 'message', 'severity', 'fix']
        }
      }
    },
    required: ['issues']
  }
} as const;

const SYSTEM = `
You lint Mermaid v10 source and suggest safe fixes. Return ONLY JSON per schema.
Guidelines:
- Be conservative; avoid intrusive changes. Prefer quoting labels, adding header, or closing blocks.
- Provide short examples in fix.example when helpful.
`;

export async function debugLint(
  model: string,
  type: 'flowchart' | 'sequence' | 'class' | 'er' | 'state' | 'mindmap',
  source: string
) {
  const snippet = source.slice(0, 2000);
  const user = [`Diagram type: ${type}`, 'Source:', snippet].join('\n\n');
  const out = await callJson({
    system: SYSTEM,
    user,
    schema: LintSchema,
    model,
    parser: { parse: (x: any) => x } as any,
    agent: 'MermaidLinter',
    temperature: 0.0
  });
  return out as { issues: Array<{ code: string; message: string; severity: string; fix: { action: string; example?: string } }> };
}
