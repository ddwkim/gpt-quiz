import type { DiagramType } from '@/lib/diagram';

export type MermaidFewShot = {
  type: DiagramType;
  error: string;
  invalid: string;
  fixed?: string;
  addedAt: number;
};

const FEWSHOT_MAX = Number(process.env.MERMAID_FEWSHOT_MAX ?? 4);

const store: Record<DiagramType, MermaidFewShot[]> = {
  flowchart: [],
  sequence: [],
  class: [],
  er: [],
  state: [],
  mindmap: []
};

function gist(err: string): string {
  return String(err || '').trim().slice(0, 160).toLowerCase();
}

function clip(s: string, max = 1200): string {
  const t = String(s || '');
  return t.length > max ? t.slice(0, max) : t;
}

export function recordFewShot(example: Omit<MermaidFewShot, 'addedAt'>) {
  const arr = store[example.type] || (store[example.type] = [] as MermaidFewShot[]);
  const key = gist(example.error);
  if (key) {
    const existingIdx = arr.findIndex((e) => gist(e.error) === key);
    const item: MermaidFewShot = {
      type: example.type,
      error: clip(example.error),
      invalid: clip(example.invalid),
      fixed: example.fixed ? clip(example.fixed) : undefined,
      addedAt: Date.now()
    };
    if (existingIdx >= 0) {
      arr.splice(existingIdx, 1, item);
    } else {
      arr.push(item);
    }
    // Keep only most recent N
    const max = Number.isFinite(FEWSHOT_MAX) ? Math.max(0, FEWSHOT_MAX) : 4;
    while (arr.length > max) arr.shift();
    // Optional: diagnostic
    console.warn('[MERMAID_FEWSHOT_ADDED]', {
      type: example.type,
      error_gist: key,
      count: arr.length
    });
  }
}

export function listFewShots(type: DiagramType, limit?: number): MermaidFewShot[] {
  const arr = store[type] || [];
  const n = Number.isFinite(limit) ? Math.max(0, Number(limit)) : arr.length;
  return arr.slice(Math.max(0, arr.length - n));
}

