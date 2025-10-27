import test from 'node:test';
import assert from 'node:assert/strict';
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

test('conversationFromPlaintext parses alternating roles', () => {
  const conv = conversationFromPlaintext(`user: Hi\nassistant: Hello!\nuser: Next line`);
  assert.equal(conv.messages.length, 3);
  assert.equal(conv.messages[0].role, 'user');
  assert.equal(conv.messages[1].role, 'assistant');
  assert.equal(conv.messages[2].role, 'user');
});

test('extractFromShare reads inline __NEXT_DATA__', async () => {
  process.env.ALLOWED_SHARE_HOSTS = 'chatgpt.com';
  const originalFetch = global.fetch;
  global.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/share/')) {
      return new Response(SAMPLE_HTML, { status: 200, headers: { 'content-type': 'text/html' } });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };

  try {
    const conversation = await extractFromShare('https://chatgpt.com/share/12345678-1234-1234-1234-1234567890ab');
    assert.equal(conversation.messages.length, 2);
    assert.equal(conversation.messages[0].content.includes('Hello'), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('QuizSchema validates minimal quiz', () => {
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
  assert.equal(parsed.items.length, 1);
});

test('cost tracker enforces OPENAI_MAX_COST_USD', async () => {
  process.env.OPENAI_MAX_COST_USD = '0.0001';
  await assert.rejects(
    runWithCostTracking(async () => {
      recordUsage('gpt-5', { input_tokens: 10_000, output_tokens: 10_000 });
    }),
    (err: any) => {
      assert.equal(isCostLimitError(err), true);
      return true;
    }
  );
  delete process.env.OPENAI_MAX_COST_USD;
});
