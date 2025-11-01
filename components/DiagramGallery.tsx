'use client';

import React, { useState } from 'react';
import type { DiagramPack } from '@/lib/diagram';
import { DiagramPanel, type PngControlOptions } from '@/components/Diagram';
import { exportSvgSafe, svgToPngClient } from '@/lib/mermaid/export';

export interface DiagramGalleryProps {
  pack: DiagramPack | null;
  loading: boolean;
  error: string | null;
}

export const DiagramGallery: React.FC<DiagramGalleryProps> = ({ pack, loading, error }) => {
  const [pngOptions, setPngOptions] = useState<PngControlOptions>({ scale: 2, padding: 16, background: '#ffffff' });
  const [exportingAll, setExportingAll] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  if (loading) {
    return <div className="rounded border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">Generating diagrams…</div>;
  }

  if (error) {
    return <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  }

  if (!pack) {
    return <div className="rounded border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">No diagrams generated yet.</div>;
  }

  const handleExportAll = async () => {
    setExportError(null);
    setExportingAll(true);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();

      for (const unit of pack.diagrams) {
        if (!unit.mermaid) continue;
        const { svg, reasons } = await exportSvgSafe(unit.mermaid, {
          padding: pngOptions.padding,
          background: pngOptions.background,
          scale: pngOptions.scale
        });
        if (reasons.length) {
          console.debug('[export]', reasons.join(','));
        }
        const blob = await svgToPngClient(svg, {
          scale: pngOptions.scale,
          padding: pngOptions.padding,
          background: pngOptions.background
        });
        zip.file(`diagram-${unit.index + 1}.png`, blob);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'diagrams.zip';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setExportError(err?.message ?? 'Failed to export PNG archive');
    } finally {
      setExportingAll(false);
    }
  };

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Diagram Gallery</h2>
            <p className="text-sm text-neutral-600">
              Mode: {pack.meta.method.toUpperCase()} · Diagrams: {pack.meta.k}
            </p>
            {pack.metadata ? (
              <p className="text-xs text-neutral-500">
                Model: {pack.metadata.model}
                {typeof pack.metadata.refined_iterations === 'number' ? ` · Refinements: ${pack.metadata.refined_iterations}` : ''}
                {typeof pack.metadata.cost_usd === 'number' ? ` · Cost: $${pack.metadata.cost_usd.toFixed(4)}` : ''}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={handleExportAll}
              disabled={exportingAll}
              className="rounded border px-3 py-2 disabled:opacity-50"
            >
              {exportingAll ? 'Exporting…' : 'Export All → PNG (ZIP)'}
            </button>
          </div>
        </div>
        {exportError && <p className="text-xs text-red-600">{exportError}</p>}
        {pack.reasons?.length ? (
          <details className="text-xs text-neutral-600">
            <summary className="cursor-pointer font-medium">Pipeline reasons</summary>
            <ul className="mt-1 list-disc pl-4">
              {pack.reasons.map((reason, idx) => (
                <li key={idx}>
                  [{reason.code}] {reason.message}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {pack.meta.crossEdges.length ? (
          <details className="text-xs text-neutral-600">
            <summary className="cursor-pointer font-medium">Cross-diagram edges</summary>
            <ul className="mt-1 list-disc pl-4">
              {pack.meta.crossEdges.map((edge, idx) => (
                <li key={idx}>
                  Diagram {edge.fromDiagram + 1} ({edge.from}) → Diagram {edge.toDiagram + 1} ({edge.to})
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </header>
      <div className="grid gap-6">
        {pack.diagrams.map((unit) => (
          <DiagramPanel
            key={unit.index}
            unit={unit}
            index={unit.index}
            pngOptions={pngOptions}
            onChangePngOptions={setPngOptions}
          />
        ))}
      </div>
    </section>
  );
};
