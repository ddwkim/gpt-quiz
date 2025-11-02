import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Conversation } from '@/lib/types';
import type { KnowledgeBlock } from '@/types/lecture';

vi.mock('@/lib/extract', () => ({
  extractFromShare: vi.fn()
}));

const { extractFromShare } = await import('@/lib/extract');
const { fetchGptSharedLink } = await import('@/lib/lecture/fetchSharedLink');
const { sanitize } = await import('@/lib/lecture/sanitize');

describe('fetchGptSharedLink', () => {
  beforeEach(() => {
    (extractFromShare as unknown as vi.Mock).mockReset();
  });

  it('splits conversation messages into knowledge blocks with code capture', async () => {
    const convo: Conversation = {
      title: 'Sample Lecture',
      messages: [
        { role: 'user', content: 'Explain transformers in simple terms.' },
        {
          role: 'assistant',
          content: `# Introduction
Transformers are a neural network architecture.

## Example
\`\`\`python
def attention(q, k, v):
    return softmax(q @ k.T) @ v
\`\`\``
        }
      ]
    };
    (extractFromShare as unknown as vi.Mock).mockResolvedValue(convo);

    const blocks = await fetchGptSharedLink('https://chatgpt.com/share/mock');
    expect(blocks.length).toBeGreaterThan(0);
    const codeBlock = blocks.find((b) => (b.code?.length ?? 0) > 0);
    expect(codeBlock?.code?.[0].lang).toBe('python');
    expect(codeBlock?.code?.[0].content).toContain('attention');
  });
});

describe('sanitize', () => {
  it('dedupes blocks and trims whitespace', () => {
    const blocks: KnowledgeBlock[] = [
      {
        id: 'kb_001',
        title: 'Intro ',
        text: ' Transformers \u00a0are powerful.\n\n\n',
        source: { url: 'https://chatgpt.com/share/mock' }
      },
      {
        id: 'kb_002',
        title: 'Intro ',
        text: 'Transformers are powerful.',
        source: { url: 'https://chatgpt.com/share/mock' }
      }
    ];

    const sanitized = sanitize(blocks);
    const introBlocks = sanitized.filter((b) => b.title === 'Intro' && b.text === 'Transformers are powerful.');
    expect(introBlocks).toHaveLength(1);
  });
});
