import { QuizConfigSchema, QuizJsonSchema, QuizSchema } from '@/lib/quiz';
import type { Conversation, QuizConfig } from '@/lib/types';
import { callJson, defaultModel } from '@/lib/openai-client';
import { loadPrompt } from '@/lib/prompts';

const quizSystemPrompts = {
  en: loadPrompt('quiz-generator.system.en.md'),
  ko: loadPrompt('quiz-generator.system.ko.md')
} as const;

export async function generateQuiz(conversation: Conversation, cfg: QuizConfig) {
  QuizConfigSchema.parse(cfg);
  const systemPrompt = buildSystemPrompt(cfg.lang);
  const userPrompt = buildUserPrompt(conversation, cfg);

  const strictSchema = buildStrictApiSchema();

  const quiz = await callJson({
    system: systemPrompt,
    user: userPrompt,
    schema: { name: 'Quiz', schema: strictSchema },
    temperature: 0.3,
    parser: QuizSchema,
    agent: 'QuizGenerator'
  });

  quiz.metadata = quiz.metadata ?? {};
  quiz.metadata.model = quiz.metadata.model ?? defaultModel;
  quiz.metadata.high_quality = quiz.metadata.high_quality ?? false;
  quiz.metadata.generated_at = new Date().toISOString();
  if (conversation.title && !quiz.title) {
    quiz.title = `Quiz: ${conversation.title}`;
  }

  return quiz;
}

function buildStrictApiSchema() {
  const sourceSpans = {
    type: 'array',
    items: {
      type: 'array',
      minItems: 2,
      maxItems: 2,
      items: { type: 'integer' }
    }
  } as const;

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      items: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: ['mcq', 'true_false', 'short_answer'] },
            prompt: { type: 'string' },
            // Always include choices; for non-mcq, model must set []
            choices: { type: 'array', items: { type: 'string' }, minItems: 0, maxItems: 8 },
            // Allow union for answer
            answer: { anyOf: [{ type: 'integer' }, { type: 'boolean' }, { type: 'string' }] },
            rationale: { type: 'string' },
            difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
            source_spans: sourceSpans
          },
          required: ['id', 'type', 'prompt', 'choices', 'answer', 'rationale', 'difficulty', 'source_spans']
        }
      }
    },
    required: ['title', 'description', 'items']
  } as const;

  return schema as unknown as Record<string, unknown>;
}

function buildSystemPrompt(lang: 'en' | 'ko'): string {
  return lang === 'ko' ? quizSystemPrompts.ko : quizSystemPrompts.en;
}

function buildUserPrompt(conversation: Conversation, cfg: QuizConfig): string {
  const banner = `Config: n=${cfg.n_questions}, difficulty=${cfg.difficulty}, mix=${cfg.mix.join(',')}, lang=${cfg.lang}`;
  const body = conversation.messages
    .map((m, i) => `${i}. [${m.role}] ${m.content}`)
    .join('\n');
  return `${banner}\n\nTRANSCRIPT\n${body}`;
}
