'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { basicSanitize } from '@/lib/mermaid/sanitize';
import type { DiagramUnit } from '@/lib/ir/schema';
import { ExportButtons } from './ExportButtons';

export interface PngControlOptions {
  scale: number;
  padding: number;
  background: string;
}

export interface DiagramPanelProps {
  unit: DiagramUnit;
  index: number;
  pngOptions: PngControlOptions;
  onChangePngOptions: (opts: PngControlOptions) => void;
}

function safeHeading(unit: DiagramUnit): { title: string; subtitle?: string } {
  if (unit.heading?.title) return unit.heading;
  return { title: `Diagram ${unit.index + 1}` };
}

export const DiagramPanel: React.FC<DiagramPanelProps> = ({ unit, index, pngOptions, onChangePngOptions }) => {
  const { title, subtitle } = safeHeading(unit);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<string>('Rendering…');
  const [error, setError] = useState<string | null>(null);

  const mermaidSource = useMemo(() => basicSanitize(unit.mermaid ?? ''), [unit.mermaid]);

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      if (!mermaidSource) {
        setStatus('No source');
        setError('Missing Mermaid source');
        return;
      }
      setStatus('Rendering…');
      setError(null);
      try {
        const mermaid = (await import('mermaid')).default;
        try {
          mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict', suppressErrorRenderer: true } as any);
        } catch {
          mermaid.initialize?.({ startOnLoad: false, theme: 'default', securityLevel: 'strict' });
        }

        const container = containerRef.current;
        if (!container || cancelled) return;
        container.innerHTML = '';

        try {
          // @ts-ignore parse exists at runtime
          mermaid.parse(mermaidSource);
        } catch (e: any) {
          if (cancelled) return;
          setError(e?.message ?? 'Mermaid parse error');
          setStatus('Render blocked (parse error)');
          container.innerHTML = `<div class="rounded border border-neutral-200 bg-red-50 p-2 text-sm text-red-600">Diagram failed to render.</div>`;
          return;
        }

        const { svg } = await mermaid.render(`m-${Date.now()}-${index}`, mermaidSource);
        if (cancelled) return;
        container.innerHTML = svg ?? '';
        setStatus('Rendered');
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message ?? 'Mermaid render error');
        setStatus('Rendering failed.');
        const container = containerRef.current;
        if (container) {
          container.innerHTML = `<div class="rounded border border-neutral-200 bg-red-50 p-2 text-sm text-red-600">Diagram failed to render.</div>`;
        }
      }
    };

    render();
    return () => {
      cancelled = true;
    };
  }, [mermaidSource, index]);

  return (
    <article className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-3">
      <header className="space-y-1">
        <h3 className="text-lg font-semibold">{title}</h3>
        {subtitle ? <p className="text-sm text-neutral-600">{subtitle}</p> : null}
        <p className="text-xs text-neutral-500">Status: {status}</p>
      </header>
      {unit.summaryBullets?.length ? (
        <ul className="list-disc pl-5 text-sm text-neutral-700">
          {unit.summaryBullets.map((line, idx) => (
            <li key={idx}>{line}</li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      <div ref={containerRef} className="overflow-auto rounded border bg-neutral-50 p-3" />
      <ExportButtons
        title={title}
        containerRef={containerRef}
        mermaidSource={unit.mermaid ?? ''}
        options={pngOptions}
        onOptionsChange={onChangePngOptions}
      />
      <details className="rounded border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
        <summary className="cursor-pointer font-medium">Mermaid source</summary>
        <pre className="mt-2 whitespace-pre-wrap">{mermaidSource}</pre>
      </details>
    </article>
  );
};
