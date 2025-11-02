import { NextRequest } from 'next/server';
import { z } from 'zod';
import { fetchGptSharedLink } from '@/lib/lecture/fetchSharedLink';
import { sanitize } from '@/lib/lecture/sanitize';
import { planLecture } from '@/lib/lecture/planner';
import { lectureIdFromShare } from '@/lib/lecture/ids';
import { cacheBlocks, getCachedBlocks, getCachedScripts } from '@/lib/lecture/store';
import { readManifest } from '@/lib/lecture/manifest';

export const runtime = 'nodejs';

const BodySchema = z.object({
  url: z.string().url(),
  minutes: z.number().min(5).max(90).optional(),
  sections: z.number().min(3).max(10).optional(),
  audienceLevel: z.string().optional(),
  language: z.string().optional(),
  model: z.string().optional()
});

export async function POST(req: NextRequest) {
  try {
    const payload = BodySchema.parse(await req.json());
    const minutes = payload.minutes ?? 20;
    const lectureId = lectureIdFromShare(payload.url, {
      targetMinutes: minutes,
      desiredSections: payload.sections,
      language: payload.language,
      audienceLevel: payload.audienceLevel
    });

    let blocks = getCachedBlocks(lectureId);
    if (!blocks) {
      const rawBlocks = await fetchGptSharedLink(payload.url);
      blocks = sanitize(rawBlocks);
      cacheBlocks(lectureId, blocks);
    }
    if (!blocks) {
      throw new Error('No knowledge blocks available for planning');
    }

    const existingManifest = await readManifest(lectureId).catch(() => null);
    const outline =
      existingManifest?.outline ??
      (await planLecture({
        url: payload.url,
        blocks,
        targetMinutes: minutes,
        desiredSections: payload.sections,
        audienceLevel: payload.audienceLevel,
        language: payload.language,
        model: payload.model
      }));

    const scripts = existingManifest?.scripts ?? getCachedScripts(lectureId);

    return Response.json({ outline, blocks, scripts, manifest: existingManifest });
  } catch (err: any) {
    console.error('[lecture][plan]', err);
    const status = err?.status ?? 500;
    const message = err?.message ?? 'Failed to plan lecture';
    return new Response(JSON.stringify({ error: { message } }), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
