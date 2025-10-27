#!/usr/bin/env tsx
import { extractFromShare } from '@/lib/extract';
import { generateQuiz } from '@/lib/openai';
import { buildHighQualityQuiz } from '@/lib/agents/quality';
import { runWithCostTracking } from '@/lib/cost-tracker';

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Usage: pnpm seed -- <share-url> [--hq] [--n=5]');
    process.exit(1);
  }

  const url = args.find((arg) => !arg.startsWith('--'));
  if (!url) {
    console.error('Missing share URL');
    process.exit(1);
  }

  const hq = args.some((arg) => arg === '--hq');
  const nArg = args.find((arg) => arg.startsWith('--n='));
  const n = nArg ? Number(nArg.split('=')[1]) : 3;

  const conv = await extractFromShare(url);
  console.error(`Extracted ${conv.messages.length} messages`);

  const config: import('@/lib/types').QuizConfig = {
    n_questions: Number.isFinite(n) && n > 0 ? n : 3,
    difficulty: 'mixed',
    mix: ['mcq', 'true_false', 'short_answer'],
    lang: 'en'
  };

  if (hq) {
    const { value: result, cost } = await runWithCostTracking(() => buildHighQualityQuiz(conv, config));
    console.error(`Estimated cost: $${cost.total_cost_usd.toFixed(4)} (${cost.total_tokens} tokens)`);
    console.log(JSON.stringify(result.quiz, null, 2));
  } else {
    const { value, cost } = await runWithCostTracking(async () => {
      const quiz = await generateQuiz(conv, config);
      return { quiz };
    });
    console.error(`Estimated cost: $${cost.total_cost_usd.toFixed(4)} (${cost.total_tokens} tokens)`);
    console.log(JSON.stringify(value.quiz, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
