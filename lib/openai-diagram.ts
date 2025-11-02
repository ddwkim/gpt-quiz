import { callJson, defaultModel } from '@/lib/openai-client';
import type { Conversation } from '@/lib/types';
import { DiagramConfig, DiagramConfigSchema, DiagramJsonSchema, DiagramSchema } from '@/lib/diagram';
import { loadPrompt } from '@/lib/prompts';

const DIAGRAM_MODEL = process.env.OPENAI_DIAGRAM_MODEL || defaultModel;
const diagramSystemPrompts = {
  en: loadPrompt('diagram-json.system.en.md'),
  ko: loadPrompt('diagram-json.system.ko.md')
} as const;

export async function generateDiagram(conversation: Conversation, cfg: DiagramConfig) {
  DiagramConfigSchema.parse(cfg);

  const systemPrompt = cfg.lang === 'ko' ? diagramSystemPrompts.ko : diagramSystemPrompts.en;
  const userPrompt = buildUserPrompt(conversation, cfg);

  const result = await callJson({
    system: systemPrompt,
    user: userPrompt,
    model: DIAGRAM_MODEL,
    schema: { name: 'Diagram', schema: DiagramJsonSchema },
    parser: DiagramSchema,
    agent: 'DiagramJSON'
  });

  return {
    ...result,
    metadata: {
      ...(result.metadata ?? {}),
      model: DIAGRAM_MODEL,
      diagram_type: cfg.type
    }
  };
}

function buildUserPrompt(conv: Conversation, cfg: DiagramConfig) {
  const banner = `Diagram type=${cfg.type}, focus=${cfg.focus}, lang=${cfg.lang}`;
  const body = conv.messages
    .map((m, i) => `${i}. [${m.role}] ${m.content}`)
    .join('\n');
  return `${banner}\n\nTRANSCRIPT\n${body}`;
}
