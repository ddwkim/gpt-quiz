import type { NextRequest } from 'next/server';
import sharp from 'sharp';
import { normalizeSvgXml, validateSvg } from '@/lib/mermaid/export_xml';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as any;
  if (!body || typeof body.svg !== 'string') {
    return new Response('Missing svg', { status: 400 });
  }

  const scale = Number.isFinite(body.scale) && body.scale > 0 ? Number(body.scale) : 2;
  const padding = Number.isFinite(body.padding) && body.padding >= 0 ? Number(body.padding) : 16;
  const background = typeof body.background === 'string' ? body.background : '#ffffff';

  const normalized = normalizeSvgXml(body.svg, { padding, background });
  const validation = validateSvg(normalized.svg);
  if (!validation.ok) {
    return new Response(`EXPORT/XML_INVALID: ${validation.error}`, { status: 422 });
  }
  const density = 72 * Math.max(1, Math.floor(scale));

  try {
    const pngBuffer = await sharp(Buffer.from(normalized.svg, 'utf8'), { density })
      .png({ compressionLevel: 9 })
      .toBuffer();

    const headers = new Headers({ 'Content-Type': 'image/png' });
    headers.set('X-Export-Width', String(normalized.width));
    headers.set('X-Export-Height', String(normalized.height));
    if (normalized.reasons.length) headers.set('X-Export-Reasons', normalized.reasons.join(','));
    return new Response(pngBuffer, { headers });
  } catch (err: any) {
    return new Response(String(err?.message ?? 'PNG export failed'), { status: 500 });
  }
}
