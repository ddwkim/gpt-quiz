'use client';

import React from 'react';
import { exportSvgSafe, svgToPngClient, type PngExportOptions } from '@/lib/mermaid/export';

export interface ExportButtonsProps {
  title: string;
  containerRef: React.RefObject<HTMLDivElement>;
  mermaidSource: string;
  options: { scale: number; padding: number; background: string };
  onOptionsChange: (opts: { scale: number; padding: number; background: string }) => void;
}

export const ExportButtons: React.FC<ExportButtonsProps> = ({ title, containerRef, mermaidSource, options, onOptionsChange }) => {
  const updateOptions = (changes: Partial<{ scale: number; padding: number; background: string }>) => {
    onOptionsChange({ ...options, ...changes });
  };

  async function exportSvg() {
    const { svg } = await exportSvgSafe(mermaidSource, {
      padding: options.padding,
      background: options.background,
      scale: options.scale
    });
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'diagram'}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportPng() {
    const { svg } = await exportSvgSafe(mermaidSource, {
      padding: options.padding,
      background: options.background,
      scale: options.scale
    });
    const pngBlob = await svgToPngClient(svg, {
      scale: options.scale,
      padding: options.padding,
      background: options.background,
      onReason: (code) => console.debug('[export]', code)
    } satisfies PngExportOptions);
    const url = URL.createObjectURL(pngBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'diagram'}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportPdf() {
    const svg = containerRef.current?.querySelector('svg');
    if (!svg) return;

    async function loadScriptOnce(src: string, id: string) {
      if (document.getElementById(id)) return;
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.id = id;
        s.async = true;
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(s);
      });
    }

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
    // @ts-ignore svg2pdf typings
    svg2pdf(svg, pdf, { x: 20, y: 20, width: bbox.width * scale, height: bbox.height * scale });
    pdf.save(`${title || 'diagram'}.pdf`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3 text-sm">
      <div className="flex items-center gap-2">
        <label className="flex flex-col text-xs text-neutral-600">
          Scale
          <input
            type="number"
            min={1}
            max={8}
            value={options.scale}
            onChange={(e) => updateOptions({ scale: Number(e.target.value) || 1 })}
            className="h-9 w-20 rounded border border-neutral-300 px-2 text-sm"
          />
        </label>
        <label className="flex flex-col text-xs text-neutral-600">
          Padding
          <input
            type="number"
            min={0}
            max={128}
            value={options.padding}
            onChange={(e) => updateOptions({ padding: Math.max(0, Number(e.target.value) || 0) })}
            className="h-9 w-20 rounded border border-neutral-300 px-2 text-sm"
          />
        </label>
        <label className="flex flex-col text-xs text-neutral-600">
          Background
          <select
            value={options.background}
            onChange={(e) => updateOptions({ background: e.target.value })}
            className="h-9 w-32 rounded border border-neutral-300 px-2 text-sm"
          >
            <option value="#ffffff">White</option>
            <option value="transparent">Transparent</option>
          </select>
        </label>
      </div>
      <div className="flex gap-2">
        <button onClick={exportSvg} className="rounded border px-3 py-2">
          Export SVG
        </button>
        <button onClick={exportPng} className="rounded border px-3 py-2">
          Export PNG
        </button>
        <button onClick={exportPdf} className="rounded border px-3 py-2">
          Export PDF
        </button>
      </div>
    </div>
  );
};
