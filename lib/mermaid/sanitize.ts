export type CloseChar = ']' | '}' | ')';

export interface LabelSanitizeOptions {
  banQuotes?: boolean;        // default true
  banHtml?: boolean;          // default true
  banBrackets?: boolean;      // default true
  wrapAt?: number;            // word-wrap later; not here
}

/** Remove characters that conflict with Mermaid grammar. No HTML, quotes, or bracket tokens. */
export function sanitizeLabelText(raw: string, opt: LabelSanitizeOptions = {}): string {
  const o = { banQuotes: true, banHtml: true, banBrackets: true, ...opt };
  let s = raw.replace(/\r\n?|\n/g, ' ');
  if (o.banHtml) s = s.replace(/<[^>]*>/g, ' ');
  if (o.banQuotes) s = s.replace(/["']/g, '');
  if (o.banBrackets) s = s.replace(/[\[\]\{\}\(\)<>]/g, '');
  return s.replace(/\s+/g, ' ').trim();
}

/** Return a shape whose closer is NOT in any label segment; otherwise fall back to 'terminator'. */
export function pickSafeShape(preferred: string | undefined, labelSegs: string[]): 'rect'|'terminator'|'decision' {
  const segs = labelSegs.join(' ');
  const bad = (closer: CloseChar) => segs.includes(closer);
  const normalized = preferred === 'decision' || preferred === 'terminator' ? preferred : 'rect';
  if (normalized === 'rect' && !bad(']')) return 'rect';
  if (normalized === 'decision' && !bad('}')) return 'decision';
  if (normalized === 'terminator' && !bad(')')) return 'terminator';
  if (!bad(']')) return 'rect';
  if (!bad('}')) return 'decision';
  return 'terminator';
}

const UNICODE_REPLACEMENTS: Array<[RegExp, string]> = [
  [/[“”«»„‟]/g, '"'],
  [/['‘’‚‛]/g, "'"],
  [/[\u2013\u2014]/g, '-'],
  [/…/g, '...'],
  [/[\u2022•]/g, '-']
];

export function normalizeUnicode(text: string): string {
  return UNICODE_REPLACEMENTS.reduce((acc, [re, replacement]) => acc.replace(re, replacement), text);
}

export function basicSanitize(src: string): string {
  const normalized = normalizeUnicode(src);
  return normalized
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .join('\n')
    .trim();
}
