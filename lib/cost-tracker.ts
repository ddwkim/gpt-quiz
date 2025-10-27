import { getPricingForModel } from '@/config/pricing';

export type CostBreakdownEntry = {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
};

export type CostSummary = {
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  limit_usd: number;
  breakdown: CostBreakdownEntry[];
};

type CostState = {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  breakdown: CostBreakdownEntry[];
  limitUsd: number;
  requestId: string;
};

let AsyncLocalStorageImpl: any = null;
try {
  AsyncLocalStorageImpl = eval('require')('node:async_hooks').AsyncLocalStorage;
} catch {
  AsyncLocalStorageImpl = null;
}

// Minimal structural type for AsyncLocalStorage without importing node types
type ALS<T> = { run: (state: T, fn: () => Promise<any> | any) => Promise<any>; getStore: () => T | undefined };

const storage: ALS<CostState> | null = AsyncLocalStorageImpl ? (new AsyncLocalStorageImpl() as ALS<CostState>) : null;
const fallbackStack: CostState[] = [];
let callCounter = 0;

let cumulativeCostUsd = 0;

const COST_LIMIT_ERROR = 'OPENAI_COST_LIMIT';

export class OpenAICostLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenAICostLimitError';
    (this as any).code = COST_LIMIT_ERROR;
  }
}

export function runWithCostTracking<T>(fn: () => Promise<T> | T): Promise<{ value: T; cost: CostSummary }> {
  const parsedLimit = Number(process.env.OPENAI_MAX_COST_USD ?? 'NaN');
  const limitUsd = Number.isFinite(parsedLimit) && parsedLimit >= 0 ? parsedLimit : Number.POSITIVE_INFINITY;
  const initialState: CostState = {
    totalCostUsd: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    breakdown: [],
    limitUsd,
    requestId: Math.random().toString(36).slice(2, 8)
  };

  if (storage) {
    return storage.run(initialState, async () => {
      const value = await fn();
      const cost = summarize(initialState);
      return { value, cost };
    });
  }

  fallbackStack.push(initialState);
  const finalize = () => {
    fallbackStack.pop();
  };

  const exec = async () => {
    try {
      const value = await fn();
      const cost = summarize(initialState);
      return { value, cost };
    } finally {
      finalize();
    }
  };

  return exec();
}

export function recordUsage(model: string, usage: any) {
  const state = storage ? storage.getStore() : fallbackStack[fallbackStack.length - 1];
  if (!state) return;

  const pricing = getPricingForModel(model);
  const inputTokens = normalizeTokens(usage?.input_tokens ?? usage?.prompt_tokens);
  const outputTokens = normalizeTokens(usage?.output_tokens ?? usage?.completion_tokens);
  const totalTokens = normalizeTokens(usage?.total_tokens);

  const effectiveInput = inputTokens ?? (totalTokens !== null ? Math.max(totalTokens - (outputTokens ?? 0), 0) : 0);
  const effectiveOutput = outputTokens ?? (totalTokens !== null ? Math.max(totalTokens - (effectiveInput ?? 0), 0) : 0);

  const inputTok = effectiveInput ?? 0;
  const outputTok = effectiveOutput ?? 0;

  const costUsd = (inputTok / 1000) * pricing.input + (outputTok / 1000) * pricing.output;

  state.totalInputTokens += inputTok;
  state.totalOutputTokens += outputTok;
  state.totalCostUsd += costUsd;
  state.breakdown.push({
    model,
    input_tokens: inputTok,
    output_tokens: outputTok,
    cost_usd: costUsd
  });

  cumulativeCostUsd += costUsd;
  const precision = Math.max(0, Math.min(8, Number(process.env.OPENAI_COST_LOG_PRECISION ?? 6)));
  const fmt = (n: number) => n.toFixed(precision);
  const pid = typeof process !== 'undefined' ? process.pid : 0;
  callCounter += 1;
  console.info(
    `[OpenAI][pid=${pid}][rid=${state.requestId}][#${callCounter}] cost=$${fmt(costUsd)} req_total=$${fmt(
      state.totalCostUsd
    )} cum=$${fmt(cumulativeCostUsd)} tokens(in=${inputTok}, out=${outputTok}) model=${model}`
  );

  if (state.totalCostUsd > state.limitUsd) {
    throw new OpenAICostLimitError(
      `OpenAI cost limit exceeded: $${state.totalCostUsd.toFixed(4)} > $${state.limitUsd.toFixed(4)}`
    );
  }
}

function summarize(state: CostState): CostSummary {
  const totalTokens = state.totalInputTokens + state.totalOutputTokens;
  return {
    total_cost_usd: state.totalCostUsd,
    total_input_tokens: state.totalInputTokens,
    total_output_tokens: state.totalOutputTokens,
    total_tokens: totalTokens,
    limit_usd: state.limitUsd,
    breakdown: state.breakdown
  };
}

function normalizeTokens(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return null;
}

export function isCostLimitError(error: unknown): error is OpenAICostLimitError {
  return error instanceof OpenAICostLimitError || (typeof error === 'object' && error !== null && (error as any).code === COST_LIMIT_ERROR);
}

export function getCumulativeCostUsd() {
  return cumulativeCostUsd;
}
