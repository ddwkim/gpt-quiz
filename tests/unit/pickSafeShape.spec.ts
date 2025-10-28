import { describe, it, expect } from 'vitest';
import { pickSafeShape } from '@/lib/mermaid/sanitize';

describe('pickSafeShape', () => {
  it('keeps preferred shape when safe', () => {
    expect(pickSafeShape('rect', ['simple label'])).toBe('rect');
  });

  it('avoids shapes whose closers appear in the label', () => {
    expect(pickSafeShape('rect', ['contains ] closer'])).toBe('decision');
    expect(pickSafeShape('decision', ['brace } closer'])).toBe('rect');
    expect(pickSafeShape('rect', ['mixed ] and } chars'])).toBe('terminator');
    expect(pickSafeShape('terminator', ['parens ) closer'])).toBe('rect');
  });
});
