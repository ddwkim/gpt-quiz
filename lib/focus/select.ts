import type { FocusProfile } from '@/lib/types';

export type Snippet = { text: string; score: number; index: number };

const ACTION_VERBS = [
  'align',
  'allocate',
  'bootstrap',
  'build',
  'canon',
  'canonicalize',
  'clean',
  'configure',
  'connect',
  'deploy',
  'emit',
  'enforce',
  'generate',
  'hydrate',
  'instrument',
  'merge',
  'optimize',
  'orchestrate',
  'persist',
  'prune',
  'refine',
  'render',
  'route',
  'schedule',
  'transform',
  'validate'
];

const CAUSAL_MARKERS = ['because', 'therefore', 'so that', 'thus', 'hence', 'thereby', 'due to', 'leads to', 'results in'];
const CONFIG_TERMS = ['config', 'configuration', 'flag', 'feature', 'toggle', 'env', 'environment', 'option', 'parameter', 'setting'];

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

  const keywordHits = parts.map((text) => {
    const t = text.toLowerCase();
    let score = 0;
    for (const kw of keywords) if (t.includes(kw)) score += 5;
    for (const term of penalties) if (t.includes(term)) score -= 4;
    const actionMatches = ACTION_VERBS.reduce((acc, verb) => (t.includes(verb) ? acc + 1 : acc), 0);
    score += actionMatches * 1.2;
    const causalMatches = CAUSAL_MARKERS.reduce((acc, marker) => (t.includes(marker) ? acc + 1 : acc), 0);
    score += causalMatches * 1.5;
    const configMatches = CONFIG_TERMS.reduce((acc, term) => (t.includes(term) ? acc + 1 : acc), 0);
    score += configMatches;
    if (/[A-Za-z_][A-Za-z0-9_]*\s*-->\s*[A-Za-z_]/.test(text)) score += 1;
    return score;
  });

  const scored: Snippet[] = parts.map((text, index) => {
    let score = keywordHits[index];
    if (score > 0) {
      for (let delta = -2; delta <= 2; delta++) {
        if (delta === 0) continue;
        const neighbor = keywordHits[index + delta];
        if (neighbor && neighbor > 0) score += 0.6;
      }
    }
    return { text, score, index };
  });

  const ranked = [...scored].sort((a, b) => b.score - a.score || a.index - b.index);

  let buf = '';
  const selected = new Set<number>();
  for (const s of ranked) {
    if (s.score <= 0) break;
    if ((buf + ' ' + s.text).length > maxChars) break;
    buf += (buf ? '\n' : '') + s.text;
    selected.add(s.index);
  }
  if (!buf) {
    buf = parts.slice(0, 20).join('\n');
  } else {
    const ordered = [...selected].sort((a, b) => a - b);
    buf = ordered.map((idx) => parts[idx]).join('\n');
  }

  const rationale = [
    `topic="${focus.topic}"`,
    `mustInclude=${(focus.mustInclude || []).join(',') || 'none'}`,
    `exclude=${(focus.exclude || []).join(',') || 'none'}`,
    `sentences=${selected.size || Math.min(parts.length, 20)}`
  ].join(', ');
  return { excerpt: buf, rationale };
}
