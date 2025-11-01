import { DOMParser as XmldomParser, XMLSerializer as XmldomSerializer } from '@xmldom/xmldom';
import { basicSanitize } from '@/lib/mermaid/sanitize';

const SVG_NS = 'http://www.w3.org/2000/svg';
const XLINK_NS = 'http://www.w3.org/1999/xlink';

export interface NormalizeOptions {
  padding?: number;
  background?: string;
  collectReason?: (code: string) => void;
}

export interface NormalizeResult {
  svg: string;
  width: number;
  height: number;
  reasons: string[];
}

function getDomParser(): DOMParser {
  if (typeof DOMParser !== 'undefined') return new DOMParser();
  return new XmldomParser() as unknown as DOMParser;
}

function getSerializer(): XMLSerializer {
  if (typeof XMLSerializer !== 'undefined') return new XMLSerializer();
  return new XmldomSerializer() as unknown as XMLSerializer;
}

function ensureNamespace(svg: Element, attr: string, value: string, reasons: string[], collect?: (code: string) => void) {
  if (!svg.hasAttribute(attr)) {
    svg.setAttribute(attr, value);
    reasons.push('EXPORT/NAMESPACE_ADDED');
    collect?.('EXPORT/NAMESPACE_ADDED');
  }
}

function sanitizeStyle(style: string | null, reasons: string[], collect?: (code: string) => void): string | null {
  if (!style) return null;
  const declarations = style
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((decl) => !/^width\s*:/i.test(decl) && !/^height\s*:/i.test(decl));
  if (declarations.length !== style.split(';').filter((part) => part.trim()).length) {
    reasons.push('EXPORT/PX_SIZE_FORCED');
    collect?.('EXPORT/PX_SIZE_FORCED');
  }
  return declarations.length ? declarations.join(';') : null;
}

function parseNumber(attr: string | null | undefined): number | undefined {
  if (!attr) return undefined;
  const match = attr.trim().match(/^-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  return Number(match[0]);
}

function measureSvgBBox(svgSource: string): { width: number; height: number } {
  if (typeof document === 'undefined') {
    return { width: 1200, height: 800 };
  }
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-99999px;top:-99999px;opacity:0;pointer-events:none;z-index:-1;';
  container.innerHTML = svgSource;
  document.body.appendChild(container);
  const svg = container.querySelector('svg');
  if (!svg || typeof (svg as any).getBBox !== 'function') {
    document.body.removeChild(container);
    return { width: 1200, height: 800 };
  }
  const bbox = (svg as any).getBBox();
  document.body.removeChild(container);
  return { width: Math.max(1, Math.ceil(bbox.width)), height: Math.max(1, Math.ceil(bbox.height)) };
}

export function normalizeSvgXml(svgSource: string, options: NormalizeOptions = {}): NormalizeResult {
  const padding = Math.max(0, options.padding ?? 16);
  const background = options.background ?? '#ffffff';
  const reasons: string[] = [];

  const parser = getDomParser();
  const serializer = getSerializer();
  const doc = parser.parseFromString(svgSource, 'image/svg+xml');
  const svg = doc.documentElement;

  ensureNamespace(svg, 'xmlns', SVG_NS, reasons, options.collectReason);
  ensureNamespace(svg, 'xmlns:xlink', XLINK_NS, reasons, options.collectReason);

  const styleAttr = sanitizeStyle(svg.getAttribute('style'), reasons, options.collectReason);
  if (styleAttr) svg.setAttribute('style', styleAttr);
  else svg.removeAttribute('style');

  const rawViewBox = svg.getAttribute('viewBox');
  let minX = 0;
  let minY = 0;
  let vbWidth: number | undefined;
  let vbHeight: number | undefined;
  if (rawViewBox) {
    const parts = rawViewBox.split(/\s+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      [minX, minY, vbWidth, vbHeight] = parts;
    }
  }

  if (!vbWidth || !vbHeight || vbWidth <= 0 || vbHeight <= 0) {
    const measured = measureSvgBBox(svgSource);
    vbWidth = measured.width;
    vbHeight = measured.height;
    reasons.push('EXPORT/NO_VIEWBOX');
    options.collectReason?.('EXPORT/NO_VIEWBOX');
  }

  if (minX !== 0 || minY !== 0) {
    const group = doc.createElementNS(SVG_NS, 'g');
    const childNodes = Array.from(svg.childNodes);
    for (const child of childNodes) {
      group.appendChild(child);
    }
    group.setAttribute('transform', `translate(${-minX}, ${-minY})`);
    svg.appendChild(group);
    minX = 0;
    minY = 0;
    reasons.push('EXPORT/NEG_ORIGIN_FIXED');
    options.collectReason?.('EXPORT/NEG_ORIGIN_FIXED');
  }

  const widthAttr = svg.getAttribute('width') || '';
  const heightAttr = svg.getAttribute('height') || '';
  const widthPercent = /%/.test(widthAttr);
  const heightPercent = /%/.test(heightAttr);
  let width = widthPercent ? undefined : parseNumber(widthAttr);
  let height = heightPercent ? undefined : parseNumber(heightAttr);
  if (widthPercent || heightPercent) {
    reasons.push('EXPORT/PERCENT_SIZE');
    options.collectReason?.('EXPORT/PERCENT_SIZE');
  }
  if (!width || !height || width <= 0 || height <= 0) {
    width = vbWidth;
    height = vbHeight;
    reasons.push('EXPORT/PX_SIZE_FORCED');
    options.collectReason?.('EXPORT/PX_SIZE_FORCED');
  }

  if (padding > 0) {
    const group = doc.createElementNS(SVG_NS, 'g');
    const childNodes = Array.from(svg.childNodes);
    for (const child of childNodes) group.appendChild(child);
    group.setAttribute('transform', `translate(${padding}, ${padding})`);
    svg.appendChild(group);
    width += padding * 2;
    height += padding * 2;
    reasons.push('EXPORT/PADDING_ADDED');
    options.collectReason?.('EXPORT/PADDING_ADDED');
  }

  if (background !== 'transparent') {
    const rect = doc.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', '0');
    rect.setAttribute('y', '0');
    rect.setAttribute('width', String(width));
    rect.setAttribute('height', String(height));
    rect.setAttribute('fill', background);
    svg.insertBefore(rect, svg.firstChild);
  }

  svg.setAttribute('width', `${width}px`);
  svg.setAttribute('height', `${height}px`);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

  if (width <= 300 && height <= 150) {
    reasons.push('EXPORT/DEFAULT_300x150');
    options.collectReason?.('EXPORT/DEFAULT_300x150');
  }

  const sanitized = serializer
    .serializeToString(svg)
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ');

  return { svg: sanitized, width, height, reasons };
}

export function validateSvg(svgSource: string): { ok: true } | { ok: false; error: string } {
  try {
    const parser = getDomParser();
    const doc = parser.parseFromString(svgSource, 'image/svg+xml');
    const parserErrors = doc.getElementsByTagName('parsererror');
    if (parserErrors.length > 0) {
      return { ok: false, error: parserErrors[0].textContent || 'Unknown XML error' };
    }
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

export function stripForeignObjects(svgSource: string): string {
  return svgSource.replace(/<foreignObject[\s\S]*?<\/foreignObject>/g, '');
}

export function sanitizeSvgSource(svgSource: string): string {
  return basicSanitize(svgSource);
}
