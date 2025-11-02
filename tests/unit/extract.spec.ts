import { afterEach, describe, expect, it, vi } from 'vitest';
import { conversationFromPlaintext, extractFromShare } from '@/lib/extract';
import { QuizSchema } from '@/lib/quiz';
import { isCostLimitError, recordUsage, runWithCostTracking } from '@/lib/cost-tracker';

const SAMPLE_HTML = `<!doctype html>
<html>
  <head></head>
  <body>
    <script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: {
        pageProps: {
          serverResponse: {
            data: {
              title: 'Sample Chat',
              messages: [
                { id: '1', role: 'user', content: 'Hello there' },
                { id: '2', role: 'assistant', content: 'General Kenobi' }
              ]
            }
          }
        }
      }
    })}</script>
  </body>
</html>`;

describe('extract helpers', () => {
  const originalEnv = process.env.ALLOWED_SHARE_HOSTS;
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env.ALLOWED_SHARE_HOSTS = originalEnv;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('parses alternating roles from plaintext transcripts', () => {
    const conv = conversationFromPlaintext(`user: Hi\nassistant: Hello!\nuser: Next line`);
    expect(conv.messages).toHaveLength(3);
    expect(conv.messages[0].role).toBe('user');
    expect(conv.messages[1].role).toBe('assistant');
    expect(conv.messages[2].role).toBe('user');
  });

  it('extracts inline __NEXT_DATA__ from chat share page', async () => {
    process.env.ALLOWED_SHARE_HOSTS = 'chatgpt.com';
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/share/')) {
        return new Response(SAMPLE_HTML, { status: 200, headers: { 'content-type': 'text/html' } });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as any;

    const conversation = await extractFromShare('https://chatgpt.com/share/12345678-1234-1234-1234-1234567890ab');
    expect(conversation.messages).toHaveLength(2);
    expect(conversation.messages[0].content).toContain('Hello');
  });

  it('validates minimal quiz shape with QuizSchema', () => {
    const quiz = {
      title: 'Sample',
      items: [
        {
          id: 'q1',
          type: 'mcq',
          prompt: 'What?',
          choices: ['A', 'B'],
          answer: 0,
          difficulty: 'easy',
          source_spans: [[0, 1]]
        }
      ],
      metadata: { high_quality: false }
    } as any;
    const parsed = QuizSchema.parse(quiz);
    expect(parsed.items).toHaveLength(1);
  });

  it('enforces OPENAI_MAX_COST_USD limit in cost tracker', async () => {
    process.env.OPENAI_MAX_COST_USD = '0.0001';
    await expect(
      runWithCostTracking(async () => {
        recordUsage('gpt-5', { input_tokens: 10_000, output_tokens: 10_000 });
      })
    ).rejects.toSatisfy((err: unknown) => {
      expect(isCostLimitError(err)).toBe(true);
      return true;
    });
    delete process.env.OPENAI_MAX_COST_USD;
  });
});
