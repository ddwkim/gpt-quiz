import { NextRequest } from 'next/server';
import { z } from 'zod';
import { OutlineSchema } from '@/lib/lecture/planner';
import { SectionScriptSchema, writeScripts } from '@/lib/lecture/scriptWriter';
import { sanitize } from '@/lib/lecture/sanitize';
import { cacheBlocks, cacheScripts, getCachedScripts } from '@/lib/lecture/store';

export const runtime = 'nodejs';

const KnowledgeBlockSchema = z.object({
  id: z.string(),
  title: z.string(),
  text: z.string(),
  source: z.object({
    url: z.string(),
    anchor: z.string().optional()
  }),
  code: z
    .array(
      z.object({
        lang: z.string().optional(),
        content: z.string()
      })
    )
    .optional()
});

const BodySchema = z.object({
  outline: OutlineSchema,
  blocks: z.array(KnowledgeBlockSchema),
  rateWpm: z.number().min(80).max(220).optional(),
  model: z.string().optional(),
  language: z.string().optional()
});

export async function POST(req: NextRequest) {
  try {
    const payload = BodySchema.parse(await req.json());
    const sanitizedBlocks = sanitize(payload.blocks);
    if (payload.outline.id) {
      cacheBlocks(payload.outline.id, sanitizedBlocks);
      const cached = getCachedScripts(payload.outline.id);
      if (cached) {
        return Response.json({ scripts: cached });
      }
    }
    const scripts = await writeScripts({
      outline: payload.outline,
      blocks: sanitizedBlocks,
      rateWpm: payload.rateWpm,
      model: payload.model,
      language: payload.language
    });
    Object.values(scripts).forEach((script) => {
      SectionScriptSchema.parse(script);
    });
    if (payload.outline.id) {
      cacheScripts(payload.outline.id, scripts);
    }
    return Response.json({ scripts });
  } catch (err: any) {
    console.error('[lecture][script]', err);
    const status = err?.status ?? 500;
    const message = err?.message ?? 'Failed to write lecture scripts';
    return new Response(JSON.stringify({ error: { message } }), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
