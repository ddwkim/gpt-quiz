import type { Conversation, QuizConfig } from '@/lib/types';
import type { Quiz, QualityReport } from '@/lib/types';
import {
  QuizConfigSchema,
  QuizJsonSchema,
  QuizSchema,
  QualityReportSchema
} from '@/lib/quiz';
import { callJson } from '@/lib/openai-client';
import { loadPrompt } from '@/lib/prompts';
import {
  CandidateBatchSchema,
  CalibratorBatchSchema,
  PolisherBatchSchema,
  RankerBatchSchema,
  RedteamBatchSchema,
  RedteamIssueSchema,
  SelfConsistencyBatchSchema,
  TopicMapSchema
} from '@/lib/agents/schemas';
import type { ItemDraft } from '@/lib/types';
import { QUALITY_DEFAULTS } from '@/config/quality';
import { z } from 'zod';

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

type TopicMapResult = z.infer<typeof TopicMapSchema>;
type TopicList = TopicMapResult['topics'];
type SelfConsistencyReportList = z.infer<typeof SelfConsistencyBatchSchema>['reports'];

export type QualityParameters = {
  candidateMultiplier: number;
  scSamples: number;
  redteamRounds: number;
  agreementThreshold: number;
  temps: {
    topic: number;
    writer: number;
    distractor: number;
    reviewer: number;
    ranker: number;
    calibrator: number;
    polisher: number;
    validator: number;
  };
  models: {
    topic: string;
    writer: string;
    distractor: string;
    reviewer: string;
    ranker: string;
    calibrator: string;
    polisher: string;
    validator: string;
  };
};

type StageArtifacts = {
  dropped: { id: string; reason: string }[];
  issues: z.infer<typeof RedteamIssueSchema>[];
  selfConsistency: {
    item_id: string;
    agreement: number;
    verdict: 'keep' | 'drop' | 'revise';
    notes?: string[];
  }[];
};

export async function buildHighQualityQuiz(
  conversation: Conversation,
  cfg: QuizConfig,
  overrides?: DeepPartial<QualityParameters>
): Promise<{ quiz: Quiz; qualityReport?: QualityReport; artifacts: StageArtifacts }> {
  const params = mergeDeep(QUALITY_DEFAULTS, overrides ?? {});
  QuizConfigSchema.parse(cfg);

  const transcript = renderTranscript(conversation);

  const topicMap = await topicMapAgent(conversation, cfg, params, transcript);

  const candidateTarget = Math.max(
    cfg.n_questions + 2,
    Math.round(cfg.n_questions * params.candidateMultiplier)
  );

  const candidates = await candidateWriterAgent(
    conversation,
    cfg,
    params,
    topicMap.topics,
    candidateTarget,
    transcript
  );

  const enriched = await distractorEngineerAgent(conversation, cfg, params, candidates, transcript);

  const sc = await selfConsistencyAgent(conversation, cfg, params, enriched, transcript);
  const passingIds = new Set(
    sc.reports
      .filter((r) => r.verdict === 'keep' && r.agreement >= params.agreementThreshold)
      .map((r) => r.item_id)
  );
  const scDropped = sc.reports
    .filter((r) => r.verdict === 'drop' || r.agreement < params.agreementThreshold)
    .map((r) => ({ id: r.item_id, reason: `self_consistency:${r.agreement.toFixed(2)}` }));

  let working = enriched.filter((item) => passingIds.has(item.id));

  const redteam = await redteamAgent(conversation, cfg, params, working, transcript, sc.reports);
  const blockingIssues = redteam.issues?.filter((issue) => issue.blocking) ?? [];
  const blockedIds = new Set(blockingIssues.map((issue) => issue.item_id));
  const redteamDropped =
    redteam.issues
      ?.filter((issue) => issue.blocking)
      .map((issue) => ({ id: issue.item_id, reason: `redteam:${issue.kind}` })) ?? [];

  working = redteam.items.filter((item) => !blockedIds.has(item.id));

  const ranker = await rankerAgent(conversation, cfg, params, working, transcript, topicMap.topics);
  const selected = ranker.selected.slice(0, cfg.n_questions);
  if (selected.length < cfg.n_questions) {
    throw new Error(`Ranker returned ${selected.length} items (expected ${cfg.n_questions})`);
  }
  const rankerDropped = [...(ranker.dropped ?? [])];

  const calibrated = await calibratorAgent(conversation, cfg, params, selected, transcript, topicMap.topics);
  if (calibrated.items.length !== cfg.n_questions) {
    throw new Error('Calibrator altered item count unexpectedly');
  }

  const polished = await polisherAgent(conversation, cfg, params, calibrated.items, transcript);
  if (polished.items.length !== cfg.n_questions) {
    throw new Error('Polisher altered item count unexpectedly');
  }

  const validator = await validatorAgent(
    conversation,
    cfg,
    params,
    polished.items,
    transcript,
    {
      topicMapJson: JSON.stringify(topicMap.topics, null, 2),
      selfConsistencyJson: JSON.stringify(sc.reports, null, 2),
      redteamIssuesJson: JSON.stringify(redteam.issues ?? [], null, 2),
      droppedJson: JSON.stringify([...scDropped, ...redteamDropped, ...rankerDropped], null, 2)
    }
  );

  const artifacts: StageArtifacts = {
    dropped: [...scDropped, ...redteamDropped, ...rankerDropped],
    issues: redteam.issues ?? [],
    selfConsistency: sc.reports
  };

  return { quiz: validator.quiz, qualityReport: validator.quiz.quality_report, artifacts };
}

function mergeDeep<T>(base: T, patch: DeepPartial<T>): T {
  const result: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const key of Object.keys(patch) as Array<keyof T>) {
    const incoming = patch[key];
    if (incoming === undefined) continue;
    const current = (base as any)[key];
    if (isPlainObject(current) && isPlainObject(incoming)) {
      result[key] = mergeDeep(current, incoming as any);
    } else {
      result[key] = incoming;
    }
  }
  return result as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function topicMapAgent(
  conversation: Conversation,
  cfg: QuizConfig,
  params: QualityParameters,
  transcript: string
) {
  const system = loadPrompt('topic-map.system.md');
  const userTpl = loadPrompt('topic-map.user.md');
  const user = renderTemplate(userTpl, {
    n: String(cfg.n_questions),
    difficulty: cfg.difficulty,
    mix: cfg.mix.join(','),
    transcript
  });
  return callJson({
    system,
    user,
    schema: { name: 'TopicMap', schema: topicMapJsonSchema },
    temperature: params.temps.topic,
    model: params.models.topic,
    parser: TopicMapSchema
  });
}

async function candidateWriterAgent(
  conversation: Conversation,
  cfg: QuizConfig,
  params: QualityParameters,
  topics: TopicList,
  target: number,
  transcript: string
) {
  const system = loadPrompt('item-writer.system.md');
  const userTpl = loadPrompt('item-writer.user.md');
  const user = renderTemplate(userTpl, {
    n: String(cfg.n_questions),
    target_count: String(target),
    difficulty: cfg.difficulty,
    mix: cfg.mix.join(','),
    topics_json: JSON.stringify(topics, null, 2),
    transcript
  });
  const payload = await callJson({
    system,
    user,
    schema: { name: 'ItemDrafts', schema: candidateJsonSchema },
    temperature: params.temps.writer,
    model: params.models.writer,
    parser: CandidateBatchSchema
  });
  return payload.items;
}

async function distractorEngineerAgent(
  conversation: Conversation,
  cfg: QuizConfig,
  params: QualityParameters,
  items: ItemDraft[],
  transcript: string
) {
  const system = loadPrompt('distractor-engineer.system.md');
  const userTpl = loadPrompt('distractor-engineer.user.md');
  const user = renderTemplate(userTpl, {
    mix: cfg.mix.join(','),
    items_json: JSON.stringify(items, null, 2),
    transcript
  });
  const res = await callJson({
    system,
    user,
    schema: { name: 'DistractorPass', schema: candidateJsonSchema },
    temperature: params.temps.distractor,
    model: params.models.distractor,
    parser: CandidateBatchSchema
  });
  return res.items;
}

async function selfConsistencyAgent(
  conversation: Conversation,
  cfg: QuizConfig,
  params: QualityParameters,
  items: ItemDraft[],
  transcript: string
) {
  const system = loadPrompt('self-consistency.system.md');
  const userTpl = loadPrompt('self-consistency.user.md');
  const user = renderTemplate(userTpl, {
    samples: String(params.scSamples),
    items_json: JSON.stringify(items, null, 2),
    transcript
  });
  return callJson({
    system,
    user,
    schema: { name: 'SelfConsistency', schema: selfConsistencyJsonSchema },
    temperature: params.temps.reviewer,
    model: params.models.reviewer,
    parser: SelfConsistencyBatchSchema
  });
}

async function redteamAgent(
  conversation: Conversation,
  cfg: QuizConfig,
  params: QualityParameters,
  items: ItemDraft[],
  transcript: string,
  scReports: SelfConsistencyReportList
) {
  const system = loadPrompt('redteam.system.md');
  const userTpl = loadPrompt('redteam.user.md');
  const user = renderTemplate(userTpl, {
    items_json: JSON.stringify(items, null, 2),
    sc_json: JSON.stringify(scReports, null, 2),
    transcript
  });
  return callJson({
    system,
    user,
    schema: { name: 'Redteam', schema: redteamJsonSchema },
    temperature: params.temps.reviewer,
    model: params.models.reviewer,
    parser: RedteamBatchSchema
  });
}

async function rankerAgent(
  conversation: Conversation,
  cfg: QuizConfig,
  params: QualityParameters,
  items: ItemDraft[],
  transcript: string,
  topics: TopicList
) {
  const system = loadPrompt('ranker.system.md');
  const userTpl = loadPrompt('ranker.user.md');
  const user = renderTemplate(userTpl, {
    n: String(cfg.n_questions),
    difficulty: cfg.difficulty,
    mix: cfg.mix.join(','),
    items_json: JSON.stringify(items, null, 2),
    topics_json: JSON.stringify(topics, null, 2),
    transcript
  });
  return callJson({
    system,
    user,
    schema: { name: 'Ranker', schema: rankerJsonSchema },
    temperature: params.temps.ranker,
    model: params.models.ranker,
    parser: RankerBatchSchema
  });
}

async function calibratorAgent(
  conversation: Conversation,
  cfg: QuizConfig,
  params: QualityParameters,
  items: ItemDraft[],
  transcript: string,
  topics: TopicList
) {
  const system = loadPrompt('calibrator.system.md');
  const userTpl = loadPrompt('calibrator.user.md');
  const user = renderTemplate(userTpl, {
    n: String(cfg.n_questions),
    difficulty: cfg.difficulty,
    mix: cfg.mix.join(','),
    items_json: JSON.stringify(items, null, 2),
    topics_json: JSON.stringify(topics, null, 2),
    transcript
  });
  return callJson({
    system,
    user,
    schema: { name: 'Calibrator', schema: calibratorJsonSchema },
    temperature: params.temps.calibrator,
    model: params.models.calibrator,
    parser: CalibratorBatchSchema
  });
}

async function polisherAgent(
  conversation: Conversation,
  cfg: QuizConfig,
  params: QualityParameters,
  items: ItemDraft[],
  transcript: string
) {
  const system = loadPrompt('polisher.system.md');
  const userTpl = loadPrompt('polisher.user.md');
  const user = renderTemplate(userTpl, {
    items_json: JSON.stringify(items, null, 2),
    transcript
  });
  return callJson({
    system,
    user,
    schema: { name: 'Polisher', schema: polisherJsonSchema },
    temperature: params.temps.polisher,
    model: params.models.polisher,
    parser: PolisherBatchSchema
  });
}

async function validatorAgent(
  conversation: Conversation,
  cfg: QuizConfig,
  params: QualityParameters,
  items: ItemDraft[],
  transcript: string,
  extras: {
    topicMapJson: string;
    selfConsistencyJson: string;
    redteamIssuesJson: string;
    droppedJson: string;
  }
) {
  const system = loadPrompt('validator.system.md');
  const userTpl = loadPrompt('validator.user.md');
  const user = renderTemplate(userTpl, {
    n: String(cfg.n_questions),
    difficulty: cfg.difficulty,
    mix: cfg.mix.join(','),
    items_json: JSON.stringify(items, null, 2),
    transcript,
    topic_map_json: extras.topicMapJson,
    self_consistency_json: extras.selfConsistencyJson,
    redteam_json: extras.redteamIssuesJson,
    dropped_json: extras.droppedJson
  });
  const result = await callJson({
    system,
    user,
    schema: { name: 'Quiz', schema: QuizJsonSchema },
    temperature: params.temps.validator,
    model: params.models.validator,
    parser: QuizSchema
  });

  if (result.quality_report) {
    QualityReportSchema.parse(result.quality_report);
  }

  result.metadata = {
    ...result.metadata,
    high_quality: true,
    generated_at: new Date().toISOString()
  };

  return { quiz: result };
}

const topicMapJsonSchema = {
  type: 'object',
  required: ['topics'],
  properties: {
    topics: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'title', 'summary', 'importance', 'span', 'facts'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          summary: { type: 'string' },
          importance: { type: 'integer', minimum: 1, maximum: 5 },
          span: {
            type: 'array',
            items: { type: 'integer' },
            minItems: 2,
            maxItems: 2
          },
          facts: { type: 'array', minItems: 1, items: { type: 'string' } }
        }
      }
    },
    notes: { type: 'array', items: { type: 'string' } }
  }
} as const;

const candidateJsonSchema = {
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: [
          'id',
          'topic_id',
          'type',
          'prompt',
          'answer',
          'difficulty',
          'source_spans'
        ],
        properties: {
          id: { type: 'string' },
          topic_id: { type: 'string' },
          type: { type: 'string', enum: ['mcq', 'true_false', 'short_answer'] },
          prompt: { type: 'string' },
          choices: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 8 },
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
          distractor_tags: { type: 'array', items: { type: 'string' } },
          notes: { type: 'array', items: { type: 'string' } },
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
    notes: { type: 'array', items: { type: 'string' } }
  }
} as const;

const selfConsistencyJsonSchema = {
  type: 'object',
  required: ['reports'],
  properties: {
    reports: {
      type: 'array',
      items: {
        type: 'object',
        required: ['item_id', 'agreement', 'verdict'],
        properties: {
          item_id: { type: 'string' },
          agreement: { type: 'number', minimum: 0, maximum: 1 },
          verdict: { type: 'string', enum: ['keep', 'drop', 'revise'] },
          alt_answers: {
            type: 'array',
            items: {
              type: 'object',
              required: ['answer', 'frequency'],
              properties: {
                answer: {
                  anyOf: [
                    { type: 'integer' },
                    { type: 'boolean' },
                    { type: 'string' }
                  ]
                },
                frequency: { type: 'number', minimum: 0, maximum: 1 }
              }
            }
          },
          notes: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }
} as const;

const redteamJsonSchema = {
  type: 'object',
  required: ['items'],
  properties: {
    items: candidateJsonSchema.properties.items,
    issues: {
      type: 'array',
      items: {
        type: 'object',
        required: ['item_id', 'kind', 'explanation'],
        properties: {
          item_id: { type: 'string' },
          kind: {
            type: 'string',
            enum: ['ambiguity', 'leakage', 'style', 'coverage', 'difficulty', 'other']
          },
          explanation: { type: 'string' },
          fix: { type: 'string' },
          severity: {
            type: 'string',
            enum: ['low', 'medium', 'high']
          },
          blocking: { type: 'boolean' }
        }
      }
    }
  }
} as const;

const rankerJsonSchema = {
  type: 'object',
  required: ['selected'],
  properties: {
    selected: candidateJsonSchema.properties.items,
    dropped: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'reason'],
        properties: {
          id: { type: 'string' },
          reason: { type: 'string' }
        }
      }
    },
    rubric_scores: { type: 'object', additionalProperties: { type: 'number' } }
  }
} as const;

const calibratorJsonSchema = {
  type: 'object',
  required: ['items'],
  properties: {
    items: candidateJsonSchema.properties.items,
    summary: {
      type: 'object',
      properties: {
        coverage: { type: 'number' },
        notes: { type: 'array', items: { type: 'string' } }
      }
    }
  }
} as const;

const polisherJsonSchema = {
  type: 'object',
  required: ['items'],
  properties: {
    items: candidateJsonSchema.properties.items
  }
} as const;

function renderTranscript(conversation: Conversation) {
  return conversation.messages
    .map((msg, idx) => `${idx}. [${msg.role}] ${msg.content}`)
    .join('\n');
}

function renderTemplate(template: string, values: Record<string, string>) {
  return template.replace(/{{(\w+)}}/g, (match, key) => {
    return values[key] ?? '';
  });
}
