import mermaid from 'mermaid';

let initialized = false;

function ensureInit() {
  if (!initialized) {
    try {
      mermaid.initialize?.({ startOnLoad: false, theme: 'default', securityLevel: 'strict' });
    } catch {
      // ignore SSR init errors
    }
    initialized = true;
  }
}

function stripFences(text: string): string {
  return text.replace(/^\s*```(?:mermaid)?\s*/i, '').replace(/\s*```\s*$/i, '');
}

function collapseWhitespace(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const leading = line.match(/^\s*/)?.[0] ?? '';
      const rest = line.slice(leading.length).replace(/[ \t]+/g, ' ').trimEnd();
      return leading + rest;
    })
    .join('\n')
    .trim();
}

function wrapWords(text: string, width: number): string {
  if (!width || width <= 0 || text.length <= width || text.includes('<br/>')) return text;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!word) continue;
    if (!current) {
      current = word;
      continue;
    }
    const next = `${current} ${word}`;
    if (next.length <= width) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.join('<br/>');
}

function wrapQuotedSegments(source: string, width: number): string {
  if (!width || width <= 0) return source;
  return source.replace(/"([^"]*)"/g, (match, inner) => `"${wrapWords(inner, width)}"`);
}

export function sanitizeMermaid(src: string, requiredHeader: string, labelWrapAt = 44): string {
  const normalized = stripFences(src).normalize('NFKD');
  const collapsed = collapseWhitespace(normalized);
  let withHeader = collapsed;
  if (!withHeader.startsWith(requiredHeader)) {
    withHeader = `${requiredHeader}\n${withHeader}`;
  }
  return wrapQuotedSegments(withHeader, labelWrapAt);
}

export async function renderSVG(source: string): Promise<string> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return '';
  ensureInit();
  const id = `m-${Date.now()}`;
  const { svg } = await mermaid.render(id, source);
  return svg as string;
}
