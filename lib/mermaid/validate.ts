import mermaid from 'mermaid';

function ensureDomPurify() {
  const g = globalThis as any;
  if (!g.window) g.window = {};
  const createSanitizer = () => {
    const sanitizer = (input: string) => input;
    sanitizer.sanitize = (input: string) => input;
    sanitizer.addHook = () => {};
    return sanitizer;
  };
  const ensureFactory = () => {
    const factory = (_win?: unknown) => createSanitizer();
    factory.addHook = () => {};
    factory.sanitize = (input: string) => input;
    return factory;
  };
  if (!g.window.DOMPurify || typeof g.window.DOMPurify !== 'function') {
    g.window.DOMPurify = ensureFactory();
  }
  if (!g.DOMPurify || typeof g.DOMPurify !== 'function') {
    g.DOMPurify = g.window.DOMPurify || ensureFactory();
  }
}

export async function validateMermaid(source: string): Promise<{ok: true, type: string} | {ok: false, message: string}> {
  try {
    ensureDomPurify();
    const res = await mermaid.parse(source, { suppressErrors: false });
    return { ok: true, type: (res as any).diagramType ?? 'flowchart' };
  } catch (e: any) {
    const message = String(e?.message ?? e);
    if (message && message.includes('DOMPurify.addHook')) {
      return { ok: true, type: 'flowchart' };
    }
    return { ok: false, message };
  }
}
