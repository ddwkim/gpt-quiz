import { z } from 'zod';

export const IssueKindSchema = z.enum([
  'ambiguity',
  'leakage',
  'style',
  'coverage',
  'difficulty',
  'other'
]);

export const QuizItemObject = z.object({
    id: z.string().min(1),
    type: z.enum(['mcq', 'true_false', 'short_answer']),
    prompt: z.string().min(1),
    // Choices may appear for all items due to API schema constraints; enforce semantics below
    choices: z.array(z.string()).max(8).optional(),
    answer: z.union([z.number().int(), z.boolean(), z.string()]),
    rationale: z.string().optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    tags: z.array(z.string()).optional(),
    source_spans: z.array(z.tuple([z.number().int(), z.number().int()])).optional()
  });

export const QuizItemSchema = QuizItemObject
  .superRefine((val, ctx) => {
    // Enforce type-specific constraints that the API-side JSON Schema cannot express
    if (val.type === 'mcq') {
      if (!Array.isArray(val.choices) || val.choices.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'MCQ items require choices with at least 2 options',
          path: ['choices']
        });
      }
      if (typeof val.answer !== 'number') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'MCQ answer must be an integer index',
          path: ['answer']
        });
      }
    } else if (val.type === 'true_false') {
      if (typeof val.answer !== 'boolean') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'True/False answer must be boolean',
          path: ['answer']
        });
      }
      // Accept no choices or an empty array; reject non-empty choices for T/F
      if (Array.isArray(val.choices) && val.choices.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'True/False items must not include choices',
          path: ['choices']
        });
      }
    } else if (val.type === 'short_answer') {
      if (typeof val.answer !== 'string') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Short-answer answer must be a string',
          path: ['answer']
        });
      }
      if (Array.isArray(val.choices) && val.choices.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Short-answer items must not include choices',
          path: ['choices']
        });
      }
    }
  });

export const QualityIssueSchema = z.object({
  kind: IssueKindSchema,
  explanation: z.string(),
  fix: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high']).optional()
});

export const ItemQualitySchema = z.object({
  item_id: z.string(),
  agreement: z.number().min(0).max(1).optional(),
  issues: z.array(QualityIssueSchema).optional(),
  notes: z.array(z.string()).optional()
});

export const QualityReportSchema = z.object({
  summary: z
    .object({
      coverage: z.number().min(0).max(1).optional(),
      difficulty_balance: z.enum(['pass', 'warn', 'fail']).optional(),
      rubric_scores: z.record(z.number()).optional(),
      notes: z.array(z.string()).optional(),
      dropped_item_count: z.number().int().optional()
    })
    .optional(),
  items: z.array(ItemQualitySchema).optional(),
  dropped_items: z.array(z.object({ id: z.string(), reason: z.string() })).optional()
});

export const QuizSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  items: z.array(QuizItemSchema).min(1),
  metadata: z
    .object({
      source_url: z.string().url().optional(),
      model: z.string().optional(),
      generated_at: z.string().optional(),
      high_quality: z.boolean().optional(),
      cost_usd: z.number().nonnegative().optional(),
      input_tokens: z.number().int().nonnegative().optional(),
      output_tokens: z.number().int().nonnegative().optional(),
      total_tokens: z.number().int().nonnegative().optional()
    })
    .optional(),
  quality_report: QualityReportSchema.optional()
});

export type Quiz = z.infer<typeof QuizSchema>;
export type QualityReport = z.infer<typeof QualityReportSchema>;

export const QuizConfigSchema = z.object({
  n_questions: z.number().int().min(1).max(25),
  difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']).default('mixed'),
  mix: z
    .array(z.enum(['mcq', 'true_false', 'short_answer']))
    .nonempty(),
  lang: z.enum(['en', 'ko']).default('en'),
  seed: z.number().int().optional()
});

export const QuizJsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    items: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'type', 'prompt', 'answer', 'difficulty'],
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: ['mcq', 'true_false', 'short_answer'] },
          prompt: { type: 'string' },
          choices: {
            type: 'array',
            items: { type: 'string' },
            minItems: 2,
            maxItems: 8
          },
          answer: {
            anyOf: [
              { type: 'integer' },
              { type: 'boolean' },
              { type: 'string' }
            ]
          },
          rationale: { type: 'string' },
          difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
          tags: { type: 'array', items: { type: 'string' } },
          source_spans: {
            type: 'array',
            items: {
              type: 'array',
              items: { type: 'integer' },
              minItems: 2,
              maxItems: 2
            }
          }
        }
      }
    },
    metadata: {
      type: 'object',
      properties: {
        source_url: { type: 'string' },
        model: { type: 'string' },
        generated_at: { type: 'string' },
        high_quality: { type: 'boolean' },
        cost_usd: { type: 'number' },
        input_tokens: { type: 'integer' },
        output_tokens: { type: 'integer' },
        total_tokens: { type: 'integer' }
      }
    },
    quality_report: {
      type: 'object',
      properties: {
        summary: {
          type: 'object',
          properties: {
            coverage: { type: 'number' },
            difficulty_balance: {
              type: 'string',
              enum: ['pass', 'warn', 'fail']
            },
            rubric_scores: {
              type: 'object',
              additionalProperties: { type: 'number' }
            },
            notes: { type: 'array', items: { type: 'string' } },
            dropped_item_count: { type: 'integer' }
          }
        },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              item_id: { type: 'string' },
              agreement: { type: 'number' },
              issues: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    kind: {
                      type: 'string',
                      enum: ['ambiguity', 'leakage', 'style', 'coverage', 'difficulty', 'other']
                    },
                    explanation: { type: 'string' },
                    fix: { type: 'string' },
                    severity: {
                      type: 'string',
                      enum: ['low', 'medium', 'high']
                    }
                  },
                  required: ['kind', 'explanation']
                }
              },
              notes: { type: 'array', items: { type: 'string' } }
            }
          }
        },
        dropped_items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'reason'],
            properties: {
              id: { type: 'string' },
              reason: { type: 'string' }
            }
          }
        }
      }
    }
  },
  required: ['items']
} as const;
