import type { TTSSegment } from '@/types/lecture';

type CaptionEntry = { index: number; start: number; end: number; text: string };

function timeline(segments: TTSSegment[], fudgeGap = 0.4): CaptionEntry[] {
  const entries: CaptionEntry[] = [];
  let cursor = 0;
  segments.forEach((segment, idx) => {
    const duration = Math.max(fudgeGap, segment.estDurationSec || fudgeGap);
    const start = cursor;
    const end = start + duration;
    cursor = end;
    entries.push({
      index: idx + 1,
      start,
      end,
      text: segment.text.trim()
    });
  });
  return entries;
}

function pad(num: number, size = 2) {
  return String(num).padStart(size, '0');
}

function formatSrtTime(seconds: number): string {
  const ms = Math.floor((seconds % 1) * 1000);
  const totalSeconds = Math.floor(seconds);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function formatVttTime(seconds: number): string {
  const ms = Math.floor((seconds % 1) * 1000);
  const totalSeconds = Math.floor(seconds);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
}

function chunkText(text: string, maxChars = 64): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function generateSrt(segments: TTSSegment[]): string {
  const entries = timeline(segments);
  return entries
    .map((entry) => {
      const lines = chunkText(entry.text).join('\n');
      return `${entry.index}\n${formatSrtTime(entry.start)} --> ${formatSrtTime(entry.end)}\n${lines}`;
    })
    .join('\n\n');
}

export function generateVtt(segments: TTSSegment[]): string {
  const entries = timeline(segments);
  const body = entries
    .map((entry) => {
      const lines = chunkText(entry.text).join('\n');
      return `${formatVttTime(entry.start)} --> ${formatVttTime(entry.end)}\n${lines}`;
    })
    .join('\n\n');
  return `WEBVTT\n\n${body}`;
}

export function buildCaptions(segments: TTSSegment[]): { srt: string; vtt: string } {
  return {
    srt: generateSrt(segments),
    vtt: generateVtt(segments)
  };
}
