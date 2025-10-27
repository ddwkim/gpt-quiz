import type { FocusProfile } from '@/lib/types';

export type Snippet = { text: string; score: number };

export function selectForFocus(
  transcript: string,
  focus: FocusProfile,
  maxChars = 2000
): { excerpt: string; rationale: string } {
  const parts = transcript
    .split(/\n+|(?<=[\.\?\!])\s+/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const keywords = new Set([
    focus.topic.toLowerCase(),
    ...((focus.mustInclude ?? []).map((s) => s.toLowerCase()))
  ]);

  const penalties = new Set((focus.exclude ?? []).map((s) => s.toLowerCase()));

  const scored: Snippet[] = parts.map((text) => {
    const t = text.toLowerCase();
    let score = 0;
    for (const kw of keywords) if (t.includes(kw)) score += 3;
    for (const term of penalties) if (t.includes(term)) score -= 2;
    if (/[A-Za-z_][A-Za-z0-9_]*\s*->/.test(text) || /TopK|softmax|router|batch/i.test(text)) score += 1;
    return { text, score };
  });

  scored.sort((a, b) => b.score - a.score);

  let buf = '';
  for (const s of scored) {
    if (s.score < 1) break;
    if ((buf + ' ' + s.text).length > maxChars) break;
    buf += (buf ? '\n' : '') + s.text;
  }
  if (!buf) buf = parts.slice(0, 20).join('\n');

  const rationale = `topic="${focus.topic}", mustInclude=${(focus.mustInclude || []).join(',')}, exclude=${
    (focus.exclude || []).join(',')
  }`;
  return { excerpt: buf, rationale };
}

