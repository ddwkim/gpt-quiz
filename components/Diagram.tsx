'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { basicSanitize } from '@/lib/mermaid/sanitize';
import type { Diagram } from '@/lib/diagram';
type SupportedDiagramType = 'flowchart' | 'sequence' | 'class' | 'er' | 'state' | 'mindmap';
const SUPPORTED_TYPES = new Set<SupportedDiagramType>(['flowchart', 'sequence', 'class', 'er', 'state', 'mindmap']);
const DEFAULT_DIAGRAM_TYPE: SupportedDiagramType = 'flowchart';

export default function DiagramView({ diagram }: { diagram: Diagram }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<string>('Rendering…');
  const [error, setError] = useState<string | null>(null);

  const diagramType = useMemo(() => {
    const candidate = diagram.metadata?.diagram_type;
    if (candidate && SUPPORTED_TYPES.has(candidate as SupportedDiagramType)) {
      return candidate as SupportedDiagramType;
    }
    return DEFAULT_DIAGRAM_TYPE;
  }, [diagram.metadata?.diagram_type]);

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      setStatus('Rendering…');
      setError(null);
      const source = basicSanitize(diagram.mermaid);
      try {
        const mermaid = (await import('mermaid')).default;
        // Initialize and suppress Mermaid's own error SVG
        try {
          // @ts-ignore
          mermaid.initialize({ startOnLoad: false, theme: 'default', suppressErrorRenderer: true });
        } catch {
          mermaid.initialize({ startOnLoad: false, theme: 'default' });
        }

        // Patch render to never inject the bomb SVG
        const originalRender = (mermaid as any)._patchedRender || mermaid.render.bind(mermaid);
        if (!(mermaid as any)._patchedRender) {
          (mermaid as any)._patchedRender = originalRender;
          mermaid.render = (async function (id: string, code: string, ...args: any[]) {
            try { return await originalRender(id, code, ...args); }
            catch (e: any) {
              console.warn('[Mermaid suppressed]', e?.message || String(e));
              return { svg: '', bindFunctions: () => {} } as any;
            }
          }) as any;
        }

        if (cancelled) return;
        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';

        // Validate before rendering; skip DOM injection on failure
        try {
          // @ts-ignore parse at runtime
          mermaid.parse(source);
        } catch (e: any) {
          if (cancelled) return;
          setError(e?.message ?? 'Mermaid parse error');
          setStatus('Render blocked due to syntax error.');
          container.innerHTML = `
            <div class="rounded-md border border-neutral-200 bg-neutral-50 p-2 text-sm text-red-600">
              Diagram failed to render. Check syntax in console.
            </div>`;
          return;
        }

        const { svg } = await mermaid.render(`m-${Date.now()}`, source);
        if (cancelled) return;
        // Detect Mermaid's fallback error SVG and avoid injecting it
        const isErrorSvg = !svg || /syntax\s+error/i.test(svg) || /mermaid\s+version/i.test(svg) || /<div[^>]+class=["']?error["']?/i.test(svg);
        if (isErrorSvg) {
          setError('Mermaid parse error');
          setStatus('Render blocked due to syntax error.');
          container.innerHTML = `
            <div class="rounded-md border border-neutral-200 bg-neutral-50 p-2 text-sm text-red-600">
              Diagram failed to render. Check syntax in console.
            </div>`;
          return;
        }
        container.innerHTML = svg;
        const iters = (diagram as any)?.metadata?.refined_iterations;
        setStatus(
          typeof iters === 'number' ? `Rendered (server refined in ${iters} step${iters === 1 ? '' : 's'})` : 'Rendered'
        );
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message ?? 'Mermaid render error');
        setStatus('Rendering failed.');
        const container = containerRef.current;
        if (container) {
          container.innerHTML = `
            <div class="rounded-md border border-neutral-200 bg-neutral-50 p-2 text-sm text-red-600">
              Diagram failed to render. Check syntax in console.
            </div>`;
        }
      }
    };

    render();
    return () => {
      cancelled = true;
    };
  }, [diagram.mermaid, diagramType]);

  async function exportSVG() {
    const el = containerRef.current?.querySelector('svg');
    if (!el) return;
    const blob = new Blob([el.outerHTML], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${diagram.title ?? 'diagram'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportPDF() {
    const svg = containerRef.current?.querySelector('svg');
    if (!svg) return;

    async function loadScriptOnce(src: string, id: string) {
      if (document.getElementById(id)) return;
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.id = id; s.async = true; s.src = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(s);
      });
    }

    // Always use UMD builds to avoid Next dev chunk errors
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', 'jspdf-umd');
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/svg2pdf.js@2.2.2/dist/svg2pdf.umd.min.js', 'svg2pdf-umd');
    // @ts-ignore
    const jsPDF = (window as any).jspdf?.jsPDF;
    // @ts-ignore
    const svg2pdf = (window as any).svg2pdf || (window as any).svg2pdfjs || (window as any).svg2pdf?.default;
    if (!jsPDF || !svg2pdf) throw new Error('PDF libraries not available');
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const bbox = svg.getBBox();
    const scale = Math.min((pageWidth - 40) / bbox.width, (pageHeight - 40) / bbox.height);
    // @ts-ignore
    svg2pdf(svg, pdf, { x: 20, y: 20, width: bbox.width * scale, height: bbox.height * scale });
    pdf.save(`${diagram.title ?? 'diagram'}.pdf`);
  }

  return (
    <section className="space-y-3">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">{diagram.title ?? 'Generated Diagram'}</h2>
        {diagram.description && <p className="text-sm text-gray-600">{diagram.description}</p>}
        <p className="text-xs text-neutral-500">
          Type: {diagramType} · {status}
        </p>
      </header>
      {error && (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div ref={containerRef} className="overflow-auto rounded border bg-white p-3" />
      {error && (
        <details className="rounded border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-900">
          <summary className="cursor-pointer font-medium">Mermaid source</summary>
          <pre className="mt-2 whitespace-pre-wrap">{basicSanitize(diagram.mermaid)}</pre>
        </details>
      )}
      <div className="flex gap-3">
        <button onClick={exportSVG} className="rounded border px-4 py-2">
          Export SVG
        </button>
        <button onClick={exportPDF} className="rounded border px-4 py-2">
          Export PDF
        </button>
        {!error && typeof (diagram as any)?.metadata?.refined_iterations === 'number' && (
          <span className="self-center text-xs text-neutral-500">Iterations: {(diagram as any).metadata.refined_iterations}</span>
        )}
      </div>
    </section>
  );
}
