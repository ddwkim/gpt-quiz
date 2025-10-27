import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const cache = new Map<string, string>();

export function loadPrompt(name: string): string {
  if (cache.has(name)) {
    return cache.get(name)!;
  }
  const full = join(process.cwd(), 'prompts', name);
  const text = readFileSync(full, 'utf-8').trim();
  cache.set(name, text);
  return text;
}
