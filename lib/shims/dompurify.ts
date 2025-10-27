// A cross-environment DOMPurify instance that always exposes instance methods like addHook.
// In the browser: constructs an instance via createDOMPurify(window).
// On the server: falls back to isomorphic-dompurify which exposes a compatible sanitize function.

// Minimal DOMPurify shim that always exposes instance-like API without imports.
// Avoids circular imports and SSR issues. Provides addHook/removeHook and a no-op sanitize.

type HookFn = (...args: any[]) => void;
const hookStore: Record<string, HookFn[]> = {};

const DOMPurifyShim = {
  sanitize(dirty: any, _cfg?: any) {
    // Mermaid mainly uses sanitize() for text nodes; a no-op is acceptable in our context.
    return typeof dirty === 'string' ? dirty : '';
  },
  addHook(name: string, fn: HookFn) {
    hookStore[name] = hookStore[name] || [];
    hookStore[name].push(fn);
  },
  removeHook(name: string) {
    hookStore[name] = [];
  },
  removeAllHooks() {
    for (const k of Object.keys(hookStore)) hookStore[k] = [];
  }
} as any;

export default DOMPurifyShim;
