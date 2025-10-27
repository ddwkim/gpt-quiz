import { NextRequest } from 'next/server';
import { extractFromShare, conversationFromPlaintext } from '@/lib/extract';
import { generateQuiz } from '@/lib/openai';
import { buildHighQualityQuiz } from '@/lib/agents/quality';
import { QuizConfigSchema } from '@/lib/quiz';
import { isCostLimitError, runWithCostTracking } from '@/lib/cost-tracker';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as any;
  if (!body) {
    return new Response('Missing body', { status: 400 });
  }

  const parse = QuizConfigSchema.safeParse(body.config ?? {});
  if (!parse.success) {
    return new Response('Bad config', { status: 400 });
  }

  const { shareUrl, transcript } = body;
  const rawHq = body.hq;
  const hq = rawHq === true || rawHq === 'true' || rawHq === 1 || rawHq === '1';

  if (!shareUrl && !transcript) {
    return new Response('Missing shareUrl or transcript', { status: 400 });
  }

  try {
    const conversation = shareUrl
      ? await extractFromShare(shareUrl)
      : conversationFromPlaintext(String(transcript));

    const config = parse.data;

    const overrides: any = {};
    if (body.quality?.candidateMultiplier !== undefined) {
      const value = Number(body.quality.candidateMultiplier);
      if (Number.isFinite(value) && value >= 1) {
        overrides.candidateMultiplier = value;
      }
    }
    if (body.quality?.scSamples !== undefined) {
      const value = Number(body.quality.scSamples);
      if (Number.isFinite(value) && value >= 1) {
        overrides.scSamples = Math.round(value);
      }
    }

    const { value: result, cost } = await runWithCostTracking(async () => {
      if (hq) {
        return buildHighQualityQuiz(conversation, config, overrides);
      }
      const quiz = await generateQuiz(conversation, config);
      return { quiz };
    });

    const quiz = result.quiz;
    const metadata = {
      ...(quiz.metadata ?? {})
    };
    if (Number.isFinite(cost.total_cost_usd)) {
      metadata.cost_usd = Math.round(cost.total_cost_usd * 10_000) / 10_000;
    }
    metadata.input_tokens = cost.total_input_tokens;
    metadata.output_tokens = cost.total_output_tokens;
    metadata.total_tokens = cost.total_tokens;
    if (shareUrl) {
      metadata.source_url = shareUrl;
    }
    quiz.metadata = metadata;

    return Response.json(quiz);
  } catch (error: any) {
    // Emit structured logs for server diagnostics
    console.error('[api/quiz] error', {
      message: error?.message,
      status: error?.status,
      stack: error?.stack?.split('\n').slice(0, 6).join('\n')
    });
    // Cost limit has a dedicated status
    if (isCostLimitError(error)) {
      return Response.json({ error: { message: String(error?.message ?? 'cost limit exceeded'), code: 'COST_LIMIT' } }, { status: 402 });
    }
    // If upstream provided an HTTP-ish status, propagate it; otherwise 500
    const status = Number.isInteger(error?.status) ? Number(error.status) : 500;
    return Response.json({ error: { message: String(error?.message ?? 'quiz failed') } }, { status });
  }
}
