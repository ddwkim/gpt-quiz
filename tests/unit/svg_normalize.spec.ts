import { beforeAll, describe, it, expect } from 'vitest';
import { normalizeSvgXml } from '@/lib/mermaid/export_xml';

beforeAll(async () => {
  if (typeof (globalThis as any).DOMParser === 'undefined') {
    const { DOMParser } = await import('@xmldom/xmldom');
    (globalThis as any).DOMParser = DOMParser;
  }
  if (typeof (globalThis as any).XMLSerializer === 'undefined') {
    const { XMLSerializer } = await import('@xmldom/xmldom');
    (globalThis as any).XMLSerializer = XMLSerializer;
  }
});

describe('normalizeSvgForExport', () => {
  it('translates negative viewBox origins', () => {
    const result = normalizeSvgXml('<svg viewBox="-10 -20 200 100"><rect width="50" height="50"/></svg>', {
      padding: 0,
      background: '#ffffff'
    });
    expect(result.width).toBe(200);
    expect(result.height).toBe(100);
    expect(result.reasons).toContain('EXPORT/NEG_ORIGIN_FIXED');
    expect(result.svg).toMatch(/viewBox="0 0 200 100"/);
    expect(result.svg).toMatch(/translate\(10, 20\)/);
  });

  it('handles percent-based width/height with padding', () => {
    const result = normalizeSvgXml('<svg width="100%" height="100%" viewBox="0 0 300 150"><circle cx="10" cy="10" r="5"/></svg>', {
      padding: 16,
      background: '#ffffff'
    });
    expect(result.width).toBe(332);
    expect(result.height).toBe(182);
    expect(result.reasons).toContain('EXPORT/PERCENT_SIZE');
    expect(result.reasons).toContain('EXPORT/PADDING_ADDED');
    expect(result.svg).toMatch(/width="332px"/);
    expect(result.svg).toMatch(/height="182px"/);
  });

  it('omits background rect when transparent requested', () => {
    const result = normalizeSvgXml('<svg viewBox="0 0 120 60"><rect width="120" height="60" fill="#ccc"/></svg>', {
      padding: 0,
      background: 'transparent'
    });
    expect(result.svg).not.toMatch(/fill="#ffffff"/);
  });

  it('adds default reason for small diagrams', () => {
    const result = normalizeSvgXml('<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>', {
      padding: 0,
      background: '#ffffff'
    });
    expect(result.reasons).toContain('EXPORT/DEFAULT_300x150');
  });
});
