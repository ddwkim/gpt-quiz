import { describe, it, expect, vi } from 'vitest';
import { exportSvgSafe } from '@/lib/mermaid/export';
import { validateSvg } from '@/lib/mermaid/export_xml';

vi.mock('@/lib/mermaid/export_render', () => ({
  renderForExport: vi.fn().mockResolvedValue(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -5 100 50"><foreignObject><div><span>bad<br>markup</span></div></foreignObject></svg>`)
}));

describe('exportSvgSafe', () => {
  it('normalizes and validates SVG output', async () => {
    const result = await exportSvgSafe('flowchart TB\nA-->B', { padding: 0, background: '#ffffff' });
    expect(result.svg).toMatch('viewBox="0 0');
    expect(result.reasons).toContain('EXPORT/NEG_ORIGIN_FIXED');
    expect(validateSvg(result.svg).ok).toBe(true);
  });
});
