import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import OpenAI from 'openai';
import type { TTSSegment } from '@/types/lecture';

export type TtsOptions = {
  outDir: string;
  model?: string;
  voice?: string;
  format?: 'mp3' | 'wav' | 'ogg';
  concurrency?: number;
  retries?: number;
  onProgress?: (info: { stage: 'tts'; segment: TTSSegment; attempt: number; path: string }) => void;
};

const DEFAULT_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
const DEFAULT_VOICE = process.env.OPENAI_TTS_VOICE || 'alloy';
const DEFAULT_FORMAT = (process.env.OPENAI_TTS_FORMAT as 'mp3' | 'wav' | 'ogg') || 'mp3';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY missing for TTS');
  }
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function synthSegmentOnce(
  segment: TTSSegment,
  options: Required<Pick<TtsOptions, 'format' | 'model' | 'voice' | 'outDir'>>
): Promise<string> {
  const outPath = join(options.outDir, segment.fileName.replace(/\.(mp3|wav|ogg)?$/i, `.${options.format}`));
  await mkdir(dirname(outPath), { recursive: true });

  const openai = getClient();
  const response = await openai.audio.speech.create({
    model: options.model,
    voice: options.voice,
    input: segment.text,
    format: options.format
  });
  const data = await response.arrayBuffer();
  await writeFile(outPath, Buffer.from(data));
  return outPath;
}

export async function synthesizeSegment(
  segment: TTSSegment,
  options: TtsOptions
): Promise<{ path: string; segment: TTSSegment }> {
  const format = options.format ?? DEFAULT_FORMAT;
  const model = options.model ?? DEFAULT_MODEL;
  const voice = options.voice ?? DEFAULT_VOICE;
  const retries = Math.max(1, options.retries ?? 3);

  let attempt = 0;
  let lastError: unknown;
  while (attempt < retries) {
    attempt += 1;
    try {
      const path = await synthSegmentOnce(segment, { format, model, voice, outDir: options.outDir });
      options.onProgress?.({ stage: 'tts', segment, attempt, path });
      return { path, segment };
    } catch (err: any) {
      lastError = err;
      const status = err?.status ?? err?.response?.status;
      const delay = Math.min(8000, 500 * 2 ** (attempt - 1));
      if (attempt >= retries || (status && status < 500 && status !== 429)) {
        break;
      }
      await sleep(delay);
    }
  }
  throw new Error(`Failed to synthesize segment ${segment.fileName}: ${String((lastError as any)?.message ?? lastError)}`);
}

export async function synthesizeSegments(
  segments: TTSSegment[],
  options: TtsOptions
): Promise<{ paths: string[] }> {
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 3, 8));
  const queue = segments.map((segment, index) => ({ segment, index }));
  const results: (string | null)[] = Array.from({ length: segments.length }, () => null);
  const workers: Promise<void>[] = [];

  for (let i = 0; i < concurrency; i += 1) {
    const worker = (async () => {
      while (queue.length) {
        const item = queue.shift();
        if (!item) break;
        const { path } = await synthesizeSegment(item.segment, options);
        results[item.index] = path;
      }
    })();
    workers.push(worker);
  }

  await Promise.all(workers);
  return { paths: results.filter((p): p is string => typeof p === 'string') };
}
