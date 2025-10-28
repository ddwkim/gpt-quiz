import { describe, it, expect } from 'vitest';
import { randomInt } from 'crypto';
import { fixTokenIssues } from '@/lib/mermaid/mutators';
import { canonicalizeIR } from '@/lib/ir/canonicalize';
import { compileToMermaid } from '@/lib/mermaid/compiler';
import { validateMermaid } from '@/lib/mermaid/validate';
import type { IR } from '@/lib/ir/schema';

const BANNED_CHARS = ['[', ']', '{', '}', '(', ')', '<', '>', '\'', '"'];
const WORDS = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'];

function randomLabel(): string {
  const word = WORDS[randomInt(0, WORDS.length)];
  const banned = BANNED_CHARS[randomInt(0, BANNED_CHARS.length)];
  const tail = WORDS[randomInt(0, WORDS.length)];
  return `${word}${banned}${tail}`;
}

describe('label sanitization property', () => {
  it('produces parseable Mermaid for random banned characters', async () => {
    const attempts = Array.from({ length: 25 }).map(async (_, idx) => {
      const ir: IR = {
        kind: 'flowchart',
        direction: idx % 2 === 0 ? 'TB' : 'LR',
        nodes: [
          { id: `n${idx}a`, label: randomLabel(), shape: idx % 3 === 0 ? 'decision' : 'rect' },
          { id: `n${idx}b`, label: `second ${randomLabel()}`, shape: idx % 3 === 1 ? 'terminator' : 'rect' }
        ],
        edges: [
          { from: `n${idx}a`, to: `n${idx}b`, label: `e${randomLabel()}` }
        ]
      };
      const fixed = fixTokenIssues(ir);
      const canonical = canonicalizeIR(fixed);
      const mermaid = compileToMermaid(canonical);
      const result = await validateMermaid(mermaid);
      expect(result.ok).toBe(true);
    });
    await Promise.all(attempts);
  });
});
