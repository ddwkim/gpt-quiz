import OpenAI from 'openai';
import { z } from 'zod';
import { recordUsage } from '@/lib/cost-tracker';

const MODEL = process.env.OPENAI_MODEL || 'gpt-5';

function resolveEffort(agent?: string): 'low' | 'medium' | 'high' {
  const norm = (s?: string) => (s || '').trim().toLowerCase();
  const isValid = (s?: string) => s === 'low' || s === 'medium' || s === 'high';
  const globalEff = norm(process.env.OPENAI_REASONING_EFFORT || 'high');
  const mermaidEff = norm(process.env.OPENAI_REASONING_EFFORT_MERMAID);
  const quizEff = norm(process.env.OPENAI_REASONING_EFFORT_QUIZ);

  if (agent) {
    if (/Quiz/i.test(agent) && isValid(quizEff)) return quizEff as any;
    if (/(Diagram|IR_|Mermaid)/i.test(agent) && isValid(mermaidEff)) return mermaidEff as any;
  }
  return (isValid(globalEff) ? globalEff : 'high') as any;
}

function reasoningBlockFor(model?: string, agent?: string) {
  // Apply reasoning effort to GPT‑5 family by default
  if (model && /gpt-5/i.test(model)) {
    const effort = resolveEffort(agent);
    return { reasoning: { effort } };
  }
  return {};
}

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY missing');
  }
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

export type JsonSchemaSpec = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type JsonCallParams<T> = {
  system: string;
  user: string;
  schema: JsonSchemaSpec;
  temperature?: number;
  model?: string;
  parser: z.ZodType<T>;
  agent?: string;
};

export async function callJson<T>({
  system,
  user,
  schema,
  temperature = 0.2,
  model = MODEL,
  parser,
  agent
}: JsonCallParams<T>): Promise<T> {
  const openai = getClient();

  // Defensive: ensure top-level JSON Schema is an object schema
  const rootSchema = normalizeRootObjectSchema(schema.schema);

  // Build a small set of format variants to maximize compatibility with
  // differing server versions. We'll try them in order until one works.
  function buildBase(includeTemperature: boolean) {
    const o: any = {
      model,
      input: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      ...reasoningBlockFor(model, agent)
    };
    if (includeTemperature && typeof temperature === 'number') {
      o.temperature = temperature;
    }
    return o;
  }

  let payload: any = {
    ...buildBase(true),
    text: {
      format: {
        type: 'json_schema',
        name: schema.name,
        schema: rootSchema,
        strict: schema.strict ?? true
      }
    }
  };

  let res: any;
  try {
    console.info(`[LLM][agent=${agent || 'unknown'}] callJson model=${model} schema=${schema.name}`);
  } catch {}
  try {
    res = await openai.responses.create(payload);
  } catch (err: any) {
    // Surface a clearer error if the server rejects format shape
    const status = err?.status;
    const msg = String(err?.message ?? '');
    const hint = 'Check Responses API: text.format = { type:"json_schema", name, schema, strict? }';
    // Retry once without temperature if this model disallows it
    if (/Unsupported parameter: 'temperature'/.test(msg)) {
      try {
        payload = {
          ...buildBase(false),
          text: payload.text
        };
        res = await openai.responses.create(payload);
      } catch (err2: any) {
        const e2: any = new Error(`OpenAI error ${err2?.status ?? ''}: ${String(err2?.message ?? '')}. ${hint}`);
        e2.status = err2?.status;
        throw e2;
      }
    } else {
      const e2: any = new Error(`OpenAI error ${status ?? ''}: ${msg}. ${hint}`);
      e2.status = status;
      throw e2;
    }
  }

  const usage = (res as any).usage ?? (res as any).response?.usage ?? null;
  if (usage) {
    recordUsage(model, usage);
    try {
      const it = usage?.input_tokens ?? usage?.prompt_tokens ?? null;
      const ot = usage?.output_tokens ?? usage?.completion_tokens ?? null;
      console.info(`[LLM][agent=${agent || 'unknown'}] done tokens in=${it ?? 'n/a'} out=${ot ?? 'n/a'} model=${model}`);
    } catch {}
  }

  const text = res.output_text;
  if (!text) {
    throw new Error('OpenAI returned empty response');
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new Error('OpenAI returned non-JSON output');
  }

  return parser.parse(json);
}

export const defaultModel = MODEL;

export type TextCallParams = {
  system: string;
  user: string;
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  agent?: string;
};

export async function callText({
  system,
  user,
  model = MODEL,
  temperature = 0,
  maxOutputTokens,
  agent
}: TextCallParams): Promise<string> {
  const openai = getClient();

  const base = {
    model,
    input: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    ...reasoningBlockFor(model, agent)
  };

  const buildPayload = (includeTemperature: boolean) => {
    const payload: any = {
      ...base,
      text: { format: { type: 'text' } }
    };
    if (includeTemperature && typeof temperature === 'number') {
      payload.temperature = temperature;
    }
    if (typeof maxOutputTokens === 'number') {
      payload.max_output_tokens = maxOutputTokens;
    }
    return payload;
  };

  let payload: any = buildPayload(true);
  let res: any;
  try { console.info(`[LLM][agent=${agent || 'unknown'}] callText model=${model}`); } catch {}
  try {
    res = await openai.responses.create(payload);
  } catch (err: any) {
    const status = err?.status;
    const msg = String(err?.message ?? '');
    if (/Unsupported parameter: 'temperature'/.test(msg)) {
      try {
        payload = buildPayload(false);
        res = await openai.responses.create(payload);
      } catch (err2: any) {
        const e2: any = new Error(`OpenAI error ${err2?.status ?? ''}: ${String(err2?.message ?? '')}`);
        e2.status = err2?.status;
        throw e2;
      }
    } else {
      const e2: any = new Error(`OpenAI error ${status ?? ''}: ${msg}`);
      e2.status = status;
      throw e2;
    }
  }

  const usage = (res as any).usage ?? (res as any).response?.usage ?? null;
  if (usage) {
    recordUsage(model, usage);
    try {
      const it = usage?.input_tokens ?? usage?.prompt_tokens ?? null;
      const ot = usage?.output_tokens ?? usage?.completion_tokens ?? null;
      console.info(`[LLM][agent=${agent || 'unknown'}] done tokens in=${it ?? 'n/a'} out=${ot ?? 'n/a'} model=${model}`);
    } catch {}
  }

  const text = res.output_text;
  if (!text) {
    throw new Error('OpenAI returned empty response');
  }
  return text.trim();
}

function normalizeRootObjectSchema(input: Record<string, unknown>) {
  let root: any = input && typeof input === 'object' ? input : {};

  // If root is not an object schema, wrap it under payload
  const isObjType = (t: any) => t === 'object' || (Array.isArray(t) && t.includes('object'));
  if (!isObjType(root.type) && !root.properties) {
    root = { type: 'object', properties: { payload: root }, required: ['payload'] };
  } else if (!root.type) {
    root.type = 'object';
  }

  // Recursively set additionalProperties: false on every object schema node
  normalizeSchemaInPlace(root);
  return root;
}

function normalizeSchemaInPlace(node: any): void {
  if (!node || typeof node !== 'object') return;

  // Ensure any object-typed schema disallows additional properties
  const isObj = node.type === 'object' || (Array.isArray(node.type) && node.type.includes('object')) || node.properties;
  if (isObj) {
    node.additionalProperties = false;
  }

  // Dive into standard JSON Schema keywords
  if (node.properties && typeof node.properties === 'object') {
    for (const key of Object.keys(node.properties)) {
      normalizeSchemaInPlace(node.properties[key]);
    }
  }

  if (node.patternProperties && typeof node.patternProperties === 'object') {
    for (const key of Object.keys(node.patternProperties)) {
      normalizeSchemaInPlace(node.patternProperties[key]);
    }
  }

  if (node.dependentSchemas && typeof node.dependentSchemas === 'object') {
    for (const key of Object.keys(node.dependentSchemas)) {
      normalizeSchemaInPlace(node.dependentSchemas[key]);
    }
  }

  if (node.$defs && typeof node.$defs === 'object') {
    for (const key of Object.keys(node.$defs)) {
      normalizeSchemaInPlace(node.$defs[key]);
    }
  }

  if (node.definitions && typeof node.definitions === 'object') {
    for (const key of Object.keys(node.definitions)) {
      normalizeSchemaInPlace(node.definitions[key]);
    }
  }

  const arraysToWalk = ['anyOf', 'oneOf', 'allOf', 'prefixItems'];
  for (const k of arraysToWalk) {
    if (Array.isArray(node[k])) {
      for (const sub of node[k]) normalizeSchemaInPlace(sub);
    }
  }

  // items can be schema or array of schemas
  if (node.items) {
    if (Array.isArray(node.items)) {
      for (const it of node.items) normalizeSchemaInPlace(it);
    } else {
      normalizeSchemaInPlace(node.items);
    }
  }

  if (node.contains) normalizeSchemaInPlace(node.contains);
  if (node.not) normalizeSchemaInPlace(node.not);
  if (node.if) normalizeSchemaInPlace(node.if);
  if (node.then) normalizeSchemaInPlace(node.then);
  if (node.else) normalizeSchemaInPlace(node.else);
}
