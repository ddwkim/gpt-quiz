export type Pricing = {
  input: number; // USD per 1K input tokens
  output: number; // USD per 1K output tokens
};

const DEFAULT_PRICING: Pricing = { input: 0.01, output: 0.03 };

const MODEL_PRICING: Record<string, Pricing> = {
  'gpt-5': { input: 0.01, output: 0.03 },
  'gpt-5-high': { input: 0.015, output: 0.045 },
  'gpt-4.1-mini': { input: 0.003, output: 0.009 }
};

function normalizeKey(model: string): string {
  return model.toLowerCase();
}

export function getPricingForModel(model: string | undefined): Pricing {
  if (!model) return DEFAULT_PRICING;
  const key = normalizeKey(model);
  if (MODEL_PRICING[key]) {
    return MODEL_PRICING[key];
  }
  // try prefix match (e.g., gpt-5-32k)
  const match = Object.entries(MODEL_PRICING).find(([name]) => key.startsWith(name));
  if (match) {
    return match[1];
  }
  return DEFAULT_PRICING;
}

export function setCustomPricing(model: string, pricing: Pricing) {
  MODEL_PRICING[normalizeKey(model)] = pricing;
}
