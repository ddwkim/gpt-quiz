import mermaid from 'mermaid';

let initialized = false;
function ensureInit() {
  if (!initialized) {
    try {
      mermaid.initialize?.({ startOnLoad: false, theme: 'default' });
    } catch {
      // ignore SSR init errors
    }
    initialized = true;
  }
}

export function sanitizeMermaid(src: string, requiredHeader: string) {
  const stripFences = (s: string) => s.replace(/^\s*```(?:mermaid)?\s*/i, '').replace(/\s*```\s*$/i, '');
  const normalize = (s: string) =>
    s
      .replace(/[“”«»„‟]/g, '"')
      .replace(/[‘’‚‛]/g, "'")
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/…/g, '...');
  let s = normalize(stripFences(src)).trimStart();
  if (!s.startsWith(requiredHeader)) s = requiredHeader + '\n' + s;
  return s;
}

export async function parseOnce(source: string) {
  ensureInit();
  try {
    // @ts-ignore
    mermaid.parse(source);
    return { ok: true as const };
  } catch (e: any) {
    return { ok: false as const, error: e?.message || String(e) };
  }
}

export async function renderSVG(source: string) {
  // Avoid server-side rendering; mermaid.render requires a DOM
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return '';
  }
  ensureInit();
  const id = `m-${Date.now()}`;
  const { svg } = await mermaid.render(id, source);
  return svg as string;
}
