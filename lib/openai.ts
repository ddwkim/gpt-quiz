import { QuizConfigSchema, QuizJsonSchema, QuizSchema } from '@/lib/quiz';
import type { Conversation, QuizConfig } from '@/lib/types';
import { callJson, defaultModel } from '@/lib/openai-client';

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
  const en = `
You are a deterministic quiz generator. Return ONLY valid JSON that matches the provided JSON Schema. No extra text or code fences.

Contract:
- Input: transcript messages + config (n_questions, mix, difficulty, lang, seed).
- Output: a JSON quiz object conforming to schema.
- Constraints:
  - Items must have: id, type in {mcq,true_false,short_answer}, prompt, answer, difficulty.
  - MCQ: include 2–8 choices; answer is an integer index.
  - true_false: no choices; answer is boolean.
  - short_answer: no choices; answer is a short string.
  - Provide source_spans for each item mapping to transcript message indices.
  - Paraphrase prompts; avoid verbatim copy.
  - Prefer concept-focused stems; ensure answerability from transcript.

Reliability:
- Temperature low; be consistent and schema-faithful.
- If the config cannot be fully satisfied, favor fewer but valid, high-quality items within constraints.
- Never include chain-of-thought or commentary.
`.trim();

  const ko = `
너는 결정론적 퀴즈 생성기다. 제공된 JSON 스키마에 맞는 JSON만 반환하라(설명/코드펜스 금지).

계약:
- 입력: 대화 메시지 + 설정(n_questions, mix, difficulty, lang, seed).
- 출력: 스키마를 만족하는 JSON 퀴즈 객체.
- 제약:
  - 각 문항: id, type{mcq,true_false,short_answer}, prompt, answer, difficulty 필수.
  - MCQ: 보기 2–8개, answer는 정수 인덱스.
  - true_false: 보기 없음, answer는 boolean.
  - short_answer: 보기 없음, answer는 짧은 문자열.
  - source_spans로 원문 메시지 인덱스 범위를 제공.
  - 문항은 의역하고 개념 중심으로 작성; 원문 복붙 금지.
  - 대화만으로 정답 가능해야 함.

신뢰성:
- 낮은 온도로 일관성/스키마 엄수.
- 설정을 완전히 만족하기 어려우면 품질 우선으로 유효 문항만 반환.
- 사고과정/설명 금지.
`.trim();

  return lang === 'ko' ? ko : en;
}

function buildUserPrompt(conversation: Conversation, cfg: QuizConfig): string {
  const banner = `Config: n=${cfg.n_questions}, difficulty=${cfg.difficulty}, mix=${cfg.mix.join(',')}, lang=${cfg.lang}`;
  const body = conversation.messages
    .map((m, i) => `${i}. [${m.role}] ${m.content}`)
    .join('\n');
  return `${banner}\n\nTRANSCRIPT\n${body}`;
}
