import type { KnowledgeBlock, SectionScript } from '@/types/lecture';

const blockCache = new Map<string, KnowledgeBlock[]>();
const scriptCache = new Map<string, Record<string, SectionScript>>();

export function cacheBlocks(id: string, blocks: KnowledgeBlock[]) {
  blockCache.set(id, blocks);
}

export function getCachedBlocks(id: string): KnowledgeBlock[] | null {
  return blockCache.get(id) ?? null;
}

export function cacheScripts(id: string, scripts: Record<string, SectionScript>) {
  scriptCache.set(id, scripts);
}

export function getCachedScripts(id: string): Record<string, SectionScript> | null {
  return scriptCache.get(id) ?? null;
}

export function clearLectureCache(id: string) {
  blockCache.delete(id);
  scriptCache.delete(id);
}
