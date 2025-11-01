import { z } from 'zod';

export const DiagramTypeSchema = z.enum(['flowchart']);
export type DiagramType = z.infer<typeof DiagramTypeSchema>;

export const SplitModeSchema = z.enum(['none', 'auto', 'byCount']);

export const AutoSplitSchema = z.object({
  maxNodes: z.number().int().min(4).max(60).default(18),
  maxEdges: z.number().int().min(4).max(120).default(22),
  targetDensity: z.number().positive().default(1.1),
  maxBridges: z.number().int().min(0).max(12).default(6)
});

export const ByCountSplitSchema = z.object({
  k: z.number().int().min(1).max(10).default(1),
  maxNodes: z.number().int().min(4).max(60).default(18),
  maxEdges: z.number().int().min(4).max(120).default(22)
});

export const DiagramSplitConfigSchema = z.object({
  mode: SplitModeSchema.default('none'),
  auto: AutoSplitSchema.default({ maxNodes: 18, maxEdges: 22, targetDensity: 1.1, maxBridges: 6 }),
  byCount: ByCountSplitSchema.default({ k: 1, maxNodes: 18, maxEdges: 22 })
});
export type DiagramSplitConfig = z.infer<typeof DiagramSplitConfigSchema>;

export const DiagramConfigSchema = z.object({
  type: DiagramTypeSchema.default('flowchart'),
  focus: z.enum(['overview', 'process', 'concept']).default('overview'),
  lang: z.enum(['en', 'ko']).default('en'),
  seed: z.number().int().optional(),
  split: DiagramSplitConfigSchema.default({ mode: 'none', auto: { maxNodes: 18, maxEdges: 22, targetDensity: 1.1, maxBridges: 6 }, byCount: { k: 1, maxNodes: 18, maxEdges: 22 } })
});
export type DiagramConfig = z.infer<typeof DiagramConfigSchema>;

export const DiagramUnitSchema = z.object({
  index: z.number().int().min(0),
  heading: z.object({
    title: z.string(),
    subtitle: z.string().optional()
  }),
  summaryBullets: z.array(z.string()),
  mermaid: z.string().optional(),
  ir: z.any(),
  metadata: z
    .object({
      refined_iterations: z.number().int().optional(),
      renderer: z.enum(['dagre', 'elk']).optional(),
      refine_error: z.string().optional(),
      debug: z.any().optional()
    })
    .optional()
});

export const DiagramPackMetaSchema = z.object({
  k: z.number().int().min(1),
  method: SplitModeSchema,
  budgets: z.object({
    maxNodes: z.number().int().min(1),
    maxEdges: z.number().int().min(1),
    targetDensity: z.number().positive().optional(),
    maxBridges: z.number().int().min(0).optional()
  }),
  crossEdges: z.array(z.object({
    from: z.string(),
    to: z.string(),
    fromDiagram: z.number().int().min(0),
    toDiagram: z.number().int().min(0)
  }))
});

export const DiagramPackSchema = z.object({
  meta: DiagramPackMetaSchema,
  diagrams: z.array(DiagramUnitSchema),
  metadata: z.object({
    model: z.string(),
    refined_iterations: z.number().int().optional(),
    cost_usd: z.number().optional(),
    input_tokens: z.number().int().optional(),
    output_tokens: z.number().int().optional(),
    total_tokens: z.number().int().optional()
  }).optional(),
  reasons: z
    .array(
      z.object({
        code: z.string(),
        message: z.string()
      })
    )
    .optional()
});
export type DiagramPack = z.infer<typeof DiagramPackSchema>;
