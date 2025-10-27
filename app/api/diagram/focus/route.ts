import { NextRequest } from 'next/server';
import { extractFromShare, conversationFromPlaintext } from '@/lib/extract';
import type { FocusProfile } from '@/lib/types';
import { isCostLimitError, runWithCostTracking } from '@/lib/cost-tracker';
import { buildMermaidFocused } from '@/lib/pipeline/build';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as any;
  if (!body) return new Response('Missing body', { status: 400 });
  const focus: FocusProfile | undefined = body.focus;
  if (!focus || typeof focus.topic !== 'string' || !focus.topic.trim()) {
    return new Response('Missing focus.topic', { status: 400 });
  }
  const { shareUrl, transcript } = body;
  if (!shareUrl && !transcript) return new Response('Missing shareUrl or transcript', { status: 400 });

  try {
    const conversation = shareUrl ? await extractFromShare(shareUrl) : conversationFromPlaintext(String(transcript));
    const fullTranscript = conversation.messages.map((m) => `${m.role}: ${m.content}`).join('\n');

    // Use the new coarse-to-fine focus pipeline
    const { value: result, cost } = await runWithCostTracking(async () => buildMermaidFocused(fullTranscript, focus));
    if (!result.ok) {
      return Response.json({ error: { message: result.error }, reasons: result.reasons, iterations: result.iterations, mermaid: result.lastMermaid, ir: result.ir }, { status: 422 });
    }

    return Response.json({ mermaid: result.mermaid, svg: result.svg, ir: result.ir, reasons: result.reasons, iterations: result.iterations, cost: { input_tokens: cost.total_input_tokens, output_tokens: cost.total_output_tokens, total_tokens: cost.total_tokens, usd: cost.total_cost_usd } });
  } catch (error: any) {
    if (isCostLimitError(error)) {
      return Response.json({ error: { message: String(error?.message ?? 'cost limit exceeded'), code: 'COST_LIMIT' } }, { status: 402 });
    }
    const status = Number.isInteger(error?.status) ? Number(error.status) : 500;
    return Response.json({ error: { message: String(error?.message ?? 'focus diagram failed') } }, { status });
  }
}
