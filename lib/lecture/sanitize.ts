import type { KnowledgeBlock } from '@/types/lecture';

const NBSP = /\u00a0/g;

function tidy(text: string): string {
  return text
    .replace(NBSP, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sanitize(blocks: KnowledgeBlock[]): KnowledgeBlock[] {
  const seen = new Set<string>();
  const out: KnowledgeBlock[] = [];
  for (const block of blocks) {
    const text = tidy(block.text);
    if (!text) continue;
    const title = block.title.trim();
    const key = `${title}::${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ...block,
      title,
      text,
      code: block.code?.map((c) => ({
        lang: c.lang,
        content: tidy(c.content)
      }))
    });
  }
  return out;
}
