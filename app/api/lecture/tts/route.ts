import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { OutlineSchema } from '@/lib/lecture/planner';
import { SectionScriptSchema } from '@/lib/lecture/scriptWriter';
import { segment } from '@/lib/lecture/segmenter';
import { synthesizeSegments } from '@/lib/lecture/ttsOpenAI';
import { buildCaptions } from '@/lib/lecture/captions';
import { buildManifest, ensureLectureDirs, writeManifest } from '@/lib/lecture/manifest';
import { stitchSegments } from '@/lib/lecture/audioPost';
import type { TTSSegment } from '@/types/lecture';
import { clearLectureCache } from '@/lib/lecture/store';

export const runtime = 'nodejs';

const ScriptsSchema = z.record(z.string(), SectionScriptSchema);

const BodySchema = z.object({
  outline: OutlineSchema,
  scripts: ScriptsSchema,
  tts: z
    .object({
      model: z.string().optional(),
      voice: z.string().optional(),
      format: z.enum(['mp3', 'wav', 'ogg']).optional(),
      concurrency: z.number().min(1).max(8).optional(),
      maxChars: z.number().min(400).max(4000).optional(),
      wordsPerMinute: z.number().min(90).max(220).optional(),
      loudness: z.number().min(-30).max(-10).optional()
    })
    .optional()
});

const DEFAULT_MAX_CHARS = Number(process.env.LECTURE_TTS_MAX_CHARS ?? '600');
const MIN_SEGMENT_CHARS = Number(process.env.LECTURE_TTS_MIN_CHARS ?? '300');

async function writeOutlineMarkdown(root: string, outlineData: z.infer<typeof OutlineSchema>) {
  const lines: string[] = [
    `# ${outlineData.title}`,
    '',
    `Source: ${outlineData.sourceUrl}`,
    '',
    '## Learning objectives',
    ...outlineData.learningObjectives.map((obj) => `- ${obj}`),
    '',
    '## Sections'
  ];
  outlineData.sections.forEach((section) => {
    lines.push(`### ${section.title}`);
    lines.push(`Goal: ${section.goal}`);
    lines.push(`Target duration: ${Math.round(section.targetDurationSec / 60)} min`);
    lines.push('');
  });
  await writeFile(join(root, 'outline.md'), lines.join('\n'), 'utf8');
}

async function writeScriptsMarkdown(root: string, scripts: Record<string, z.infer<typeof SectionScriptSchema>>) {
  const dir = join(root, 'scripts');
  await mkdir(dir, { recursive: true });
  for (const [sectionId, script] of Object.entries(scripts)) {
    const safe = sectionId.replace(/[^a-z0-9_-]+/gi, '_');
    const body = [`# ${sectionId}`, ''];
    script.paragraphs.forEach((para) => {
      body.push(para);
      body.push('');
    });
    if (script.recap?.length) {
      body.push('## Recap');
      script.recap.forEach((line) => body.push(`- ${line}`));
      body.push('');
    }
    await writeFile(join(dir, `${safe}.md`), body.join('\n'), 'utf8');
  }
}

function collectSegments(
  outline: z.infer<typeof OutlineSchema>,
  scripts: Record<string, z.infer<typeof SectionScriptSchema>>,
  format: 'mp3' | 'wav' | 'ogg',
  maxChars: number,
  wordsPerMinute?: number
): TTSSegment[] {
  const segments: TTSSegment[] = [];
  outline.sections.forEach((section, index) => {
    const script = scripts[section.id];
    if (!script) {
      throw new Error(`Missing script for section ${section.id}`);
    }
    const segs = segment(script, {
      sectionIndex: index,
      extension: format,
      maxChars,
      wordsPerMinute
    });
    segments.push(...segs);
  });
  return segments;
}

function isHeaderFieldError(err: any): boolean {
  const msg = typeof err?.message === 'string' ? err.message : '';
  return msg.includes('Request Header Fields Too Large');
}

export async function POST(req: NextRequest) {
  try {
    const payload = BodySchema.parse(await req.json());
    const outline = payload.outline;
    const scripts = payload.scripts;
    const tts = payload.tts ?? {};
    const format = tts.format ?? 'mp3';
    let concurrency = Math.max(1, Math.min(tts.concurrency ?? 3, 4));
    const { root, segmentsDir } = await ensureLectureDirs(outline.id);

    let maxChars = tts.maxChars && tts.maxChars > 0 ? tts.maxChars : DEFAULT_MAX_CHARS;
    let segments = collectSegments(outline, scripts, format, maxChars, tts.wordsPerMinute);

    let synthesized = false;
    let attempts = 0;
    let lastError: unknown = null;
    while (!synthesized && attempts < 4) {
      attempts += 1;
      try {
        await synthesizeSegments(segments, {
          outDir: segmentsDir,
          model: tts.model,
          voice: tts.voice,
          format,
          concurrency,
          onProgress: (info) => {
            console.info('[lecture][tts]', info.segment.fileName, info.attempt);
          }
        });
        synthesized = true;
      } catch (err: any) {
        lastError = err;
        if (isHeaderFieldError(err)) {
          if (concurrency > 1) {
            console.warn('[lecture][tts] reducing concurrency due to header error', concurrency, '-> 1');
            concurrency = 1;
          }
          if (maxChars > MIN_SEGMENT_CHARS) {
            const previous = maxChars;
            maxChars = Math.max(MIN_SEGMENT_CHARS, Math.floor(maxChars * 0.75));
            console.warn(
              `[lecture][tts] reducing segment size due to header error (${previous} -> ${maxChars})`
            );
            segments = collectSegments(outline, scripts, format, maxChars, tts.wordsPerMinute);
            continue;
          }
          continue;
        }
        throw err;
      }
    }

    if (!synthesized) {
      const reason = lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown error');
      throw new Error(`Failed to synthesize audio after multiple attempts: ${reason}`);
    }

    await writeOutlineMarkdown(root, outline);
    await writeScriptsMarkdown(root, scripts);

    const captions = buildCaptions(segments);
    const srtPath = join(root, 'captions.srt');
    const vttPath = join(root, 'captions.vtt');
    await writeFile(srtPath, captions.srt, 'utf8');
    await writeFile(vttPath, captions.vtt, 'utf8');

    const fullOutputPath = join(root, `full.${format}`);
    const segmentDiskPaths = segments.map((segment) => join(segmentsDir, segment.fileName));
    const stitched = await stitchSegments(segmentDiskPaths, fullOutputPath, {
      loudness: tts.loudness ?? -16,
      format
    });
    const fullWebPath = stitched.ok ? `/lecture/${outline.id}/full.${format}` : undefined;

    const manifest = buildManifest({
      id: outline.id,
      sourceUrl: outline.sourceUrl,
      lang: outline.language ?? 'en',
      outline,
      scripts,
      segments,
      audio: {
        format,
        voice: tts.voice ?? 'alloy',
        model: tts.model ?? 'gpt-4o-mini-tts',
        full: fullWebPath
      },
      captions: {
        srt: `/lecture/${outline.id}/captions.srt`,
        vtt: `/lecture/${outline.id}/captions.vtt`
      }
    });

    await writeManifest(manifest);
    clearLectureCache(outline.id);

    return Response.json({
      id: outline.id,
      segments: segments.length,
      manifest,
      stitch: stitched
    });
  } catch (err: any) {
    console.error('[lecture][tts]', err);
    const status = err?.status ?? 500;
    const message = err?.message ?? 'Failed to synthesize lecture audio';
    return new Response(JSON.stringify({ error: { message } }), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
