import { NextRequest } from 'next/server';
import { extractFromShare, conversationFromPlaintext } from '@/lib/extract';
import { isCostLimitError, runWithCostTracking } from '@/lib/cost-tracker';
import { DiagramConfigSchema } from '@/lib/diagram';
import { buildMermaidFromSpec } from '@/lib/pipeline/build';
import { refineMermaidOnServer } from '@/lib/mermaid/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as any;
  if (!body) return new Response('Missing body', { status: 400 });

  const parse = DiagramConfigSchema.safeParse(body.config ?? {});
  if (!parse.success) return new Response('Bad config', { status: 400 });

  const { shareUrl, transcript } = body;
  if (!shareUrl && !transcript) return new Response('Missing shareUrl or transcript', { status: 400 });

  try {
    const conversation = shareUrl
      ? await extractFromShare(shareUrl)
      : conversationFromPlaintext(String(transcript));

    const config = parse.data;
    const fullSpec = conversation.messages.map((m) => `[${m.role}] ${m.content}`).join('\n');
    const { value: result, cost } = await runWithCostTracking(async () => buildMermaidFromSpec(fullSpec, 'TB'));

    if (!result.ok) {
      return Response.json({ error: { message: String(result.error ?? 'diagram failed') }, reasons: result.reasons, iterations: result.iterations, mermaid: result.lastMermaid, ir: result.ir }, { status: 422 });
    }

    // Wrap into Diagram JSON shape expected by the client
    const diagram: any = {
      title: conversation.title ?? 'Generated Diagram',
      description: undefined,
      mermaid: result.mermaid,
      metadata: {
        model: process.env.OPENAI_MODEL || 'gpt-5',
        refined_iterations: result.iterations
      }
    };

    // Optional: attempt string-level refinement + debug metadata
    try {
      const refine = await refineMermaidOnServer(diagram.mermaid, config.type);
      if (refine.ok) {
        diagram.mermaid = refine.source;
        diagram.metadata = {
          ...(diagram.metadata ?? {}),
          refined_iterations: (diagram.metadata?.refined_iterations ?? 0) + refine.iterations,
          debug: refine.debug
        };
      } else {
        diagram.metadata = {
          ...(diagram.metadata ?? {}),
          refined_iterations: (diagram.metadata?.refined_iterations ?? 0) + refine.iterations,
          refine_error: refine.error,
          debug: refine.debug
        };
      }
    } catch (e: any) {
      diagram.metadata = {
        ...(diagram.metadata ?? {}),
        refine_error: String(e?.message ?? e)
      };
    }

    diagram.metadata = {
      ...(diagram.metadata ?? {}),
      cost_usd: Math.round(cost.total_cost_usd * 1000000) / 1000000,
      input_tokens: cost.total_input_tokens,
      output_tokens: cost.total_output_tokens,
      total_tokens: cost.total_tokens
    };

    return Response.json(diagram);
  } catch (error: any) {
    console.error('[api/diagram] error', {
      message: error?.message,
      status: error?.status,
      stack: error?.stack?.split('\n').slice(0, 6).join('\n')
    });
    if (isCostLimitError(error)) {
      return Response.json({ error: { message: String(error?.message ?? 'cost limit exceeded'), code: 'COST_LIMIT' } }, { status: 402 });
    }
    const status = Number.isInteger(error?.status) ? Number(error.status) : 500;
    return Response.json({ error: { message: String(error?.message ?? 'diagram failed') } }, { status });
  }
}
