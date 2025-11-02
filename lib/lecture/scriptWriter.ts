import { z } from 'zod';
import { callJson } from '@/lib/openai-client';
import type { KnowledgeBlock, LectureOutline, SectionScript } from '@/types/lecture';
import { loadPrompt } from '@/lib/prompts';

export const SectionScriptSchema = z.object({
  sectionId: z.string().min(1),
  paragraphs: z.array(z.string().min(1)).min(1),
  quizlets: z
    .array(
      z.object({
        question: z.string().min(1),
        answer: z.string().min(1)
      })
    )
    .optional(),
  recap: z.array(z.string().min(1)).optional()
});

const SectionScriptJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sectionId: { type: 'string' },
    paragraphs: { type: 'array', minItems: 1, items: { type: 'string' } },
    quizlets: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          question: { type: 'string' },
          answer: { type: 'string' }
        },
        required: ['question', 'answer']
      }
    },
    recap: { type: 'array', items: { type: 'string' } }
  },
  required: ['sectionId', 'paragraphs', 'quizlets', 'recap']
} as const;

const lectureScriptSystemPrompt = loadPrompt('lecture-script.system.md');

export type ScriptWriterParams = {
  outline: LectureOutline;
  blocks: KnowledgeBlock[];
  rateWpm?: number;
  model?: string;
  language?: string;
};

const MAX_CONTEXT_CHARS = 16000;

function buildSourceContext(blocks: KnowledgeBlock[], sectionTitle: string) {
  const prioritized = blocks
    .slice()
    .sort((a, b) => {
      const aScore = a.title.toLowerCase().includes(sectionTitle.toLowerCase()) ? 1 : 0;
      const bScore = b.title.toLowerCase().includes(sectionTitle.toLowerCase()) ? 1 : 0;
      if (aScore !== bScore) return bScore - aScore;
      return b.text.length - a.text.length;
    });

  const lines: string[] = [];
  for (const block of prioritized) {
    const chunk = `### ${block.title}\n${block.text.trim()}`;
    lines.push(chunk);
    if (lines.join('\n\n').length > MAX_CONTEXT_CHARS) {
      break;
    }
  }
  const joined = lines.join('\n\n');
  return joined.length > MAX_CONTEXT_CHARS ? joined.slice(0, MAX_CONTEXT_CHARS) : joined;
}

export async function writeScripts({
  outline,
  blocks,
  rateWpm = 145,
  model,
  language
}: ScriptWriterParams): Promise<Record<string, SectionScript>> {
  const results: Record<string, SectionScript> = {};

  for (const section of outline.sections) {
    const sourceContext = buildSourceContext(blocks, section.title);
    const targetSeconds = Math.max(60, section.targetDurationSec);
    const userPrompt = [
      `Lecture: ${outline.title}`,
      `Section ID: ${section.id}`,
      `Section title: ${section.title}`,
      `Goal: ${section.goal}`,
      `Target duration (sec): ${targetSeconds}`,
      `Speaking rate (words per minute): ${rateWpm}`,
      `Language: ${language ?? outline.language ?? 'en'}`,
      '',
      'Relevant source notes:',
      sourceContext || '[No additional context]'
    ].join('\n');

    const script = await callJson({
      system: lectureScriptSystemPrompt,
      user: userPrompt,
      schema: { name: 'SectionScript', schema: SectionScriptJsonSchema },
      model: model ?? 'gpt-5-2025-08-07',
      parser: SectionScriptSchema,
      agent: 'LectureScriptWriter'
    });

    const normalized: SectionScript = {
      sectionId: section.id,
      paragraphs: script.paragraphs.map((p) => p.replace(/\s+$/g, '').trim()),
      quizlets: script.quizlets?.map((q) => ({
        question: q.question.trim(),
        answer: q.answer.trim()
      })),
      recap: script.recap?.map((r) => r.trim())
    };

    results[section.id] = normalized;
  }

  return results;
}
