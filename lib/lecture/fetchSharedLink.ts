import { extractFromShare } from '@/lib/extract';
import type { KnowledgeBlock } from '@/types/lecture';

const MAX_BLOCK_LEN = 8000;

type Message = { role: 'user' | 'assistant'; content: string };

function splitIntoBlocks(message: Message): { title: string; text: string }[] {
  const rolePrefix = message.role === 'assistant' ? 'Lecture Material' : 'Learner Prompt';
  const lines = message.content.split(/\r?\n/);
  const sections: { title: string; text: string }[] = [];
  let currentTitle = '';
  let buffer: string[] = [];

  const flush = () => {
    if (!buffer.length) return;
    const raw = buffer.join('\n').trim();
    if (!raw) {
      buffer = [];
      return;
    }
    const title = currentTitle || `${rolePrefix}`;
    sections.push({ title, text: raw });
    buffer = [];
    currentTitle = '';
  };

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.*)$/);
    if (headingMatch) {
      flush();
      currentTitle = headingMatch[1].trim();
      continue;
    }
    buffer.push(line);
    if (buffer.join('\n').length >= MAX_BLOCK_LEN) {
      flush();
    }
  }
  flush();

  if (!sections.length && message.content.trim()) {
    sections.push({ title: rolePrefix, text: message.content.trim() });
  }

  return sections;
}

function extractCode(text: string) {
  const results: { lang?: string; content: string }[] = [];
  const regex = /```([\w-]+)?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const lang = match[1] ? match[1].trim() : undefined;
    const content = match[2].replace(/\s+$/g, '');
    results.push({ lang, content });
  }
  return results;
}

export async function fetchGptSharedLink(url: string): Promise<KnowledgeBlock[]> {
  const convo = await extractFromShare(url);
  const blocks: KnowledgeBlock[] = [];
  let ordinal = 0;
  for (let i = 0; i < convo.messages.length; i += 1) {
    const message = convo.messages[i];
    const sections = splitIntoBlocks(message);
    for (const section of sections) {
      const id = `kb_${String(++ordinal).padStart(3, '0')}`;
      const code = extractCode(section.text);
      blocks.push({
        id,
        title: section.title || `Section ${ordinal}`,
        text: section.text.trim(),
        source: {
          url,
          anchor: `${message.role}-${i}`
        },
        code: code.length ? code : undefined
      });
    }
  }
  return blocks;
}
