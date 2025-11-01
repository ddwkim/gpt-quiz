import { sanitizeSvgSource } from '@/lib/mermaid/export_xml';
import { renderForExport, type ExportRenderOptions } from '@/lib/mermaid/export_render';
import {
  normalizeSvgXml,
  validateSvg,
  stripForeignObjects,
  type NormalizeOptions,
  type NormalizeResult
} from '@/lib/mermaid/export_xml';

const SVG_MIME = 'image/svg+xml;charset=utf-8';

export interface SvgExportOptions extends ExportRenderOptions {
  padding?: number;
  background?: string;
  onReason?: (code: string) => void;
  scale?: number;
}

export interface SvgExportResult extends NormalizeResult {}

export interface PngExportOptions {
  scale?: number;
  padding?: number;
  background?: string;
  useImageBitmap?: boolean;
  onReason?: (code: string) => void;
}

function resolveScale(scale?: number): number {
  const deviceScale = typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 2;
  const fallback = Math.max(1, Math.floor(deviceScale));
  if (typeof scale === 'number' && Number.isFinite(scale) && scale > 0) return scale;
  return fallback;
}

export async function exportSvgSafe(mermaidSource: string, options: SvgExportOptions = {}): Promise<SvgExportResult> {
  const sanitizedSource = sanitizeSvgSource(mermaidSource);
  const rawSvg = await renderForExport(sanitizedSource, options);
  const normalization: NormalizeOptions = {
    padding: options.padding,
    background: options.background,
    collectReason: options.onReason
  } as any;
  const normalized = normalizeSvgXml(rawSvg, normalization);
  normalized.reasons.forEach((code) => options.onReason?.(code));
  const validation = validateSvg(normalized.svg);
  if (validation.ok) return normalized;

  const stripped = stripForeignObjects(normalized.svg);
  const second = validateSvg(stripped);
  if (second.ok) {
    options.onReason?.('EXPORT/FOREIGNOBJECT_STRIPPED');
    return { ...normalized, svg: stripped, reasons: [...normalized.reasons, 'EXPORT/FOREIGNOBJECT_STRIPPED'] };
  }

  throw new Error(`EXPORT/XML_INVALID: ${validation.error}`);
}

export async function svgToPngClient(svgSource: string, opt: PngExportOptions = {}): Promise<Blob> {
  const scale = resolveScale(opt.scale);
  const svgBlob = new Blob([svgSource], { type: SVG_MIME });
  const url = URL.createObjectURL(svgBlob);

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load SVG for PNG export'));
    image.src = url;
  });

  try {
    const width = Math.ceil(img.naturalWidth * scale) || 1;
    const height = Math.ceil(img.naturalHeight * scale) || 1;
    const canvas: HTMLCanvasElement | OffscreenCanvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height });

    const ctx = canvas.getContext('2d', { alpha: opt.background === 'transparent' }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    if (!ctx) throw new Error('Canvas context unavailable');
    if ('imageSmoothingEnabled' in ctx) {
      (ctx as any).imageSmoothingEnabled = true;
      (ctx as any).imageSmoothingQuality = 'high';
    }
    ctx.drawImage(img, 0, 0, width, height);

    if (typeof (canvas as any).convertToBlob === 'function') {
      return await (canvas as any).convertToBlob({ type: 'image/png' });
    }

    return await new Promise<Blob>((resolve, reject) => {
      (canvas as HTMLCanvasElement).toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create PNG blob'));
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportPngSafe(mermaidSource: string, opt: PngExportOptions & SvgExportOptions = {}): Promise<{ png: Blob; svg: string }> {
  const result = await exportSvgSafe(mermaidSource, opt);
  const png = await svgToPngClient(result.svg, opt);
  return { png, svg: result.svg };
}
