import { z } from 'zod';
import { callJson } from '@/lib/openai-client';
import { lectureIdFromShare } from '@/lib/lecture/ids';
import type { KnowledgeBlock, LectureOutline, LectureOutlineSection } from '@/types/lecture';
import { loadPrompt } from '@/lib/prompts';

export const OutlineSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  goal: z.string().min(1),
  targetDurationSec: z.number().positive()
});

export const OutlineSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  prerequisites: z.array(z.string()).default([]),
  learningObjectives: z.array(z.string()).min(1),
  sections: z.array(OutlineSectionSchema).min(1),
  totalTargetSec: z.number().positive().optional(),
  sourceUrl: z.string().url().optional(),
  language: z.string().optional(),
  audienceLevel: z.string().optional()
});

const OutlineJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    prerequisites: { type: 'array', items: { type: 'string' } },
    learningObjectives: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 10 },
    sections: {
      type: 'array',
      minItems: 1,
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          goal: { type: 'string' },
          targetDurationSec: { type: 'number', minimum: 60 }
        },
        required: ['id', 'title', 'goal', 'targetDurationSec']
      }
    },
    totalTargetSec: { type: 'number', minimum: 180 },
    sourceUrl: { type: 'string' },
    language: { type: 'string' },
    audienceLevel: { type: 'string' }
  },
  required: [
    'id',
    'title',
    'prerequisites',
    'learningObjectives',
    'sections',
    'totalTargetSec',
    'sourceUrl',
    'language',
    'audienceLevel'
  ]
} as const;

const plannerSystemPrompt = loadPrompt('lecture-planner.system.md');

export type PlanLectureParams = {
  url: string;
  blocks: KnowledgeBlock[];
  targetMinutes: number;
  desiredSections?: number;
  audienceLevel?: string;
  language?: string;
  model?: string;
};

const MAX_CONTENT_CHARS = 16000;

function renderBlocks(blocks: KnowledgeBlock[]) {
  const segments: string[] = [];
  for (const block of blocks) {
    const header = `### ${block.title} (${block.id})`;
    segments.push(`${header}\n${block.text.trim()}`);
  }
  const joined = segments.join('\n\n');
  return joined.length > MAX_CONTENT_CHARS ? joined.slice(0, MAX_CONTENT_CHARS) : joined;
}

function ensureSectionIds(sections: LectureOutlineSection[]): LectureOutlineSection[] {
  return sections.map((section, idx) => {
    const baseId = section.id && section.id.trim().length > 0 ? section.id.trim() : `sec_${idx + 1}`;
    return {
      ...section,
      id: baseId
    };
  });
}

function normalizeOutline(
  result: z.infer<typeof OutlineSchema>,
  url: string,
  targetMinutes: number,
  desiredSections?: number,
  language?: string,
  audienceLevel?: string
): LectureOutline {
  const totalFromMinutes = Math.round(targetMinutes * 60);
  const sections = ensureSectionIds(result.sections);
  let totalTargetSec = result.totalTargetSec && result.totalTargetSec > 0 ? result.totalTargetSec : totalFromMinutes;
  const sumSections = sections.reduce((sum, s) => sum + (s.targetDurationSec > 0 ? s.targetDurationSec : 0), 0);
  if (!sumSections || Math.abs(sumSections - totalTargetSec) > totalTargetSec * 0.2) {
    const per = Math.round(totalTargetSec / sections.length);
    for (const section of sections) {
      section.targetDurationSec = per;
    }
    totalTargetSec = per * sections.length;
  }

  const prerequisites = result.prerequisites?.filter((p) => p.trim().length) ?? [];
  const objectives = result.learningObjectives.filter((o) => o.trim().length);

  return {
    id: result.id || lectureIdFromShare(url, { targetMinutes, desiredSections, language, audienceLevel }),
    title: result.title.trim(),
    prerequisites,
    learningObjectives: objectives,
    sections,
    totalTargetSec,
    sourceUrl: url,
    language,
    audienceLevel
  };
}

export async function planLecture({
  url,
  blocks,
  targetMinutes,
  desiredSections,
  audienceLevel,
  language,
  model
}: PlanLectureParams): Promise<LectureOutline> {
  if (!blocks.length) {
    throw new Error('No knowledge blocks available');
  }
  const minutes = Math.max(5, Math.min(90, targetMinutes));
  const sectionHint = desiredSections ? Math.max(3, Math.min(10, desiredSections)) : undefined;
  const userPrompt = [
    `Source URL: ${url}`,
    `Language: ${language ?? 'en'}`,
    `Audience level: ${audienceLevel ?? 'general'}`,
    `Target duration (minutes): ${minutes}`,
    `Desired sections: ${sectionHint ?? 'auto'}`,
    '',
    'SOURCE MATERIAL',
    renderBlocks(blocks)
  ].join('\n');

  const raw = await callJson({
    system: plannerSystemPrompt,
    user: userPrompt,
    schema: { name: 'LectureOutline', schema: OutlineJsonSchema },
    model: model ?? 'gpt-5-2025-08-07',
    parser: OutlineSchema,
    agent: 'LecturePlanner'
  });

  return normalizeOutline(raw, url, minutes, sectionHint, language, audienceLevel);
}
