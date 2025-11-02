import type { SectionScript, TTSSegment } from '@/types/lecture';

export type SegmenterOptions = {
  maxChars?: number;
  wordsPerMinute?: number;
  sectionIndex?: number;
  extension?: 'mp3' | 'wav' | 'ogg';
};

const DEFAULT_MAX_CHARS = Number(process.env.LECTURE_TTS_MAX_CHARS ?? '1000');
const WORDS_PER_MINUTE = 150;

function estimateDurationSec(text: string, wpm: number) {
  const words = text.trim().split(/\s+/).filter(Boolean).length || 1;
  const minutes = words / Math.max(80, wpm);
  return Math.max(4, Math.round(minutes * 60));
}

function splitSentences(text: string): string[] {
  const parts = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length) return [text.trim()];
  return parts;
}

function scatterIntoChunks(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text.trim()];
  const sentences = splitSentences(text);
  const chunks: string[] = [];
  let buf = '';
  const push = () => {
    if (!buf.trim()) return;
    chunks.push(buf.trim());
    buf = '';
  };

  for (const sentence of sentences) {
    if (!sentence) continue;
    const candidate = buf ? `${buf} ${sentence}` : sentence;
    if (candidate.length <= maxChars) {
      buf = candidate;
    } else if (sentence.length > maxChars) {
      push();
      const slices = sentence.match(new RegExp(`.{1,${maxChars}}`, 'g')) ?? [sentence];
      for (const slice of slices) {
        chunks.push(slice.trim());
      }
    } else {
      push();
      buf = sentence;
    }
  }
  push();

  return chunks;
}

function canonicalSectionPrefix(sectionId: string, indexHint?: number) {
  const digits = sectionId.match(/\d+/g);
  if (digits && digits.length) {
    return digits[digits.length - 1].slice(-2).padStart(2, '0');
  }
  if (typeof indexHint === 'number') {
    return String(indexHint + 1).padStart(2, '0');
  }
  return sectionId.slice(0, 6).replace(/[^a-z0-9]/gi, '').padEnd(2, '0').slice(0, 2);
}

export function segment(script: SectionScript, options: SegmenterOptions = {}): TTSSegment[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const wpm = options.wordsPerMinute ?? WORDS_PER_MINUTE;
  const extension = options.extension ?? 'mp3';

  if (maxChars < 200) {
    throw new Error('maxChars too small for TTS segmentation');
  }

  const prefix = canonicalSectionPrefix(script.sectionId, options.sectionIndex);
  const segments: TTSSegment[] = [];
  let ordinal = 0;
  let buffer = '';

  const flush = () => {
    const text = buffer.trim();
    if (!text) {
      buffer = '';
      return;
    }
    const estDurationSec = estimateDurationSec(text, wpm);
    ordinal += 1;
    segments.push({
      sectionId: script.sectionId,
      ordinal,
      text,
      estDurationSec,
      fileName: `${prefix}_${String(ordinal).padStart(2, '0')}.${extension}`
    });
    buffer = '';
  };

  const paragraphs = script.paragraphs ?? [];
  for (const para of paragraphs) {
    if (!para) continue;
    const chunks = para.split(/\[pause\]/i);
    for (const chunk of chunks) {
      const trimmed = chunk.replace(/\s+/g, ' ').trim();
      if (!trimmed) {
        flush();
        continue;
      }

      if (trimmed.length > maxChars) {
        flush();
        const longPieces = scatterIntoChunks(trimmed, maxChars);
        for (const piece of longPieces) {
          buffer = piece;
          flush();
        }
        continue;
      }

      const candidate = buffer ? `${buffer} ${trimmed}` : trimmed;
      if (candidate.length > maxChars) {
        flush();
        buffer = trimmed;
      } else {
        buffer = candidate;
      }
    }
  }
  flush();

  return segments;
}
