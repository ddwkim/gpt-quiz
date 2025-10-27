import { z } from 'zod';

export const DiagramTypeSchema = z.enum(['flowchart', 'sequence', 'class', 'er', 'state', 'mindmap']);
export type DiagramType = z.infer<typeof DiagramTypeSchema>;

export const DiagramConfigSchema = z.object({
  type: DiagramTypeSchema.default('flowchart'),
  focus: z.enum(['overview', 'process', 'concept']).default('overview'),
  lang: z.enum(['en', 'ko']).default('en'),
  seed: z.number().int().optional()
});
export type DiagramConfig = z.infer<typeof DiagramConfigSchema>;

export const DiagramSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  mermaid: z.string().min(1),
  source_spans: z
    .array(z.tuple([z.number().int(), z.number().int()]))
    .optional(),
  metadata: z
    .object({
      model: z.string(),
      diagram_type: DiagramTypeSchema.optional()
    })
    .optional()
});
export type Diagram = z.infer<typeof DiagramSchema>;

// JSON Schema used for Responses API structured output
export const DiagramJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    mermaid: { type: 'string' },
    source_spans: {
      type: 'array',
      items: {
        type: 'array',
        items: { type: 'integer' },
        minItems: 2,
        maxItems: 2
      }
    },
    metadata: {
      type: 'object',
      additionalProperties: false,
      properties: {
        model: { type: 'string' }
      },
      required: ['model']
    }
  },
  required: ['title', 'description', 'mermaid', 'source_spans', 'metadata']
} as const;
