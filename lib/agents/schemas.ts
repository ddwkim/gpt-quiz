import { z } from 'zod';
import { IssueKindSchema, QualityIssueSchema, QuizItemObject } from '@/lib/quiz';

export const TopicSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  importance: z.number().min(1).max(5),
  span: z.tuple([z.number().int(), z.number().int()]),
  facts: z.array(z.string()).min(1)
});

export const TopicMapSchema = z.object({
  topics: z.array(TopicSchema).nonempty(),
  notes: z.array(z.string()).optional()
});

export const ItemDraftSchema = QuizItemObject.extend({
  topic_id: z.string(),
  source_spans: z.array(z.tuple([z.number().int(), z.number().int()])).min(1),
  distractor_tags: z.array(z.string()).optional(),
  notes: z.array(z.string()).optional()
});

export const CandidateBatchSchema = z.object({
  items: z.array(ItemDraftSchema).nonempty(),
  notes: z.array(z.string()).optional()
});

export const SelfConsistencyReportSchema = z.object({
  item_id: z.string(),
  agreement: z.number().min(0).max(1),
  verdict: z.enum(['keep', 'drop', 'revise']),
  alt_answers: z
    .array(
      z.object({
        answer: z.union([z.number().int(), z.boolean(), z.string()]),
        frequency: z.number().min(0).max(1)
      })
    )
    .optional(),
  notes: z.array(z.string()).optional()
});

export const SelfConsistencyBatchSchema = z.object({
  reports: z.array(SelfConsistencyReportSchema)
});

export const RedteamIssueSchema = QualityIssueSchema.extend({
  item_id: z.string(),
  kind: IssueKindSchema,
  blocking: z.boolean()
});

export const RedteamBatchSchema = z.object({
  items: z.array(ItemDraftSchema),
  issues: z.array(RedteamIssueSchema).optional()
});

export const RankerBatchSchema = z.object({
  selected: z.array(ItemDraftSchema),
  dropped: z.array(z.object({ id: z.string(), reason: z.string() })).optional(),
  rubric_scores: z.record(z.number()).optional()
});

export const CalibratorBatchSchema = z.object({
  items: z.array(ItemDraftSchema),
  summary: z
    .object({
      coverage: z.number().min(0).max(1).optional(),
      notes: z.array(z.string()).optional()
    })
    .optional()
});

export const PolisherBatchSchema = z.object({
  items: z.array(ItemDraftSchema)
});
