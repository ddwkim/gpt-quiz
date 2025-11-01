import { NextRequest } from 'next/server';
import { z } from 'zod';
import { extractFromShare, conversationFromPlaintext } from '@/lib/extract';
import type { FocusProfile } from '@/lib/types';
import { isCostLimitError, runWithCostTracking } from '@/lib/cost-tracker';
import { buildMermaidFocused, type SplitSettings } from '@/lib/pipeline/build';
import { DiagramPackSchema, DiagramSplitConfigSchema } from '@/lib/diagram';

export const runtime = 'nodejs';

function splitConfigToSettings(split: z.infer<typeof DiagramSplitConfigSchema> | undefined): SplitSettings | undefined {
  if (!split) return undefined;
  const auto = split.auto ?? { maxNodes: 18, maxEdges: 22, targetDensity: 1.1, maxBridges: 6 };
  if (split.mode === 'byCount') {
    return {
      mode: 'byCount',
      maxNodes: split.byCount.maxNodes,
      maxEdges: split.byCount.maxEdges,
      targetDensity: auto.targetDensity,
      maxBridges: auto.maxBridges,
      k: split.byCount.k
    };
  }
  if (split.mode === 'auto') {
    return {
      mode: 'auto',
      maxNodes: auto.maxNodes,
      maxEdges: auto.maxEdges,
      targetDensity: auto.targetDensity,
      maxBridges: auto.maxBridges
    };
  }
  return {
    mode: 'none',
    maxNodes: auto.maxNodes,
    maxEdges: auto.maxEdges,
    targetDensity: auto.targetDensity,
    maxBridges: auto.maxBridges
  };
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as any;
  if (!body) return new Response('Missing body', { status: 400 });
  const focus: FocusProfile | undefined = body.focus;
  if (!focus || typeof focus.topic !== 'string' || !focus.topic.trim()) {
    return new Response('Missing focus.topic', { status: 400 });
  }
  const { shareUrl, transcript } = body;
  if (!shareUrl && !transcript) return new Response('Missing shareUrl or transcript', { status: 400 });

  const splitParse = DiagramSplitConfigSchema.safeParse(body.split ?? {});
  const splitSettings = splitConfigToSettings(splitParse.success ? splitParse.data : undefined);

  try {
    const conversation = shareUrl ? await extractFromShare(shareUrl) : conversationFromPlaintext(String(transcript));
    const fullTranscript = conversation.messages.map((m) => `${m.role}: ${m.content}`).join('\n');

    const { value: result, cost } = await runWithCostTracking(async () => buildMermaidFocused(fullTranscript, focus, splitSettings));
    if (!result.ok) {
      return Response.json({ error: { message: result.error }, reasons: result.reasons, iterations: result.iterations, mermaid: result.lastMermaid, ir: result.ir }, { status: 422 });
    }

    const pack = result.pack;
    const compiledLookup = new Map<number, string>();
    for (const item of result.diagrams) compiledLookup.set(item.index, item.mermaid);
    for (const unit of pack.diagrams) {
      unit.mermaid = compiledLookup.get(unit.index) ?? unit.mermaid ?? '';
    }

    const responsePayload = {
      meta: pack.meta,
      diagrams: pack.diagrams,
      reasons: result.reasons,
      metadata: {
        model: process.env.OPENAI_MODEL || 'gpt-5',
        refined_iterations: result.iterations,
        cost_usd: Math.round(cost.total_cost_usd * 1000000) / 1000000,
        input_tokens: cost.total_input_tokens,
        output_tokens: cost.total_output_tokens,
        total_tokens: cost.total_tokens
      }
    };

    const validation = DiagramPackSchema.safeParse(responsePayload);
    if (!validation.success) {
      console.warn('[api/diagram/focus] response validation failed', validation.error);
    }

    return Response.json(responsePayload);
  } catch (error: any) {
    if (isCostLimitError(error)) {
      return Response.json({ error: { message: String(error?.message ?? 'cost limit exceeded'), code: 'COST_LIMIT' } }, { status: 402 });
    }
    const status = Number.isInteger(error?.status) ? Number(error.status) : 500;
    return Response.json({ error: { message: String(error?.message ?? 'focus diagram failed') } }, { status });
  }
}
