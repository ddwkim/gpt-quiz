'use client';

import React from 'react';
import type { DiagramSplitConfig } from '@/lib/diagram';

type Mode = DiagramSplitConfig['mode'];

interface Props {
  value: DiagramSplitConfig;
  onChange: (value: DiagramSplitConfig) => void;
}

function updateSplit(value: DiagramSplitConfig, changes: Partial<DiagramSplitConfig>): DiagramSplitConfig {
  return {
    ...value,
    ...changes,
    auto: { ...value.auto, ...(changes.auto ?? {}) },
    byCount: { ...value.byCount, ...(changes.byCount ?? {}) }
  };
}

export const DiagramSplitControls: React.FC<Props> = ({ value, onChange }) => {
  const { mode, auto, byCount } = value;

  const handleModeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextMode = event.target.value as Mode;
    onChange(updateSplit(value, { mode: nextMode }));
  };

  const handleAutoChange = (key: keyof typeof auto) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = key === 'targetDensity' ? parseFloat(event.target.value) : parseInt(event.target.value, 10);
    onChange(updateSplit(value, { auto: { ...auto, [key]: Number.isNaN(parsed) ? auto[key] : parsed } }));
  };

  const handleByCountChange = (key: keyof typeof byCount) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const parsed = parseInt(event.target.value, 10);
    onChange(updateSplit(value, { byCount: { ...byCount, [key]: Number.isNaN(parsed) ? byCount[key] : parsed } }));
  };

  return (
    <section className="space-y-3">
      <header>
        <h3 className="text-sm font-semibold text-neutral-700">Diagram splitting</h3>
        <p className="text-xs text-neutral-500">Automatically split complex diagrams to improve readability.</p>
      </header>
      <label className="block text-sm font-medium">Mode</label>
      <select
        value={mode}
        onChange={handleModeChange}
        className="w-full h-10 rounded border border-neutral-300 px-3 text-sm"
      >
        <option value="none">None (single diagram)</option>
        <option value="auto">Auto (split when budgets exceeded)</option>
        <option value="byCount">By count</option>
      </select>
      {mode === 'auto' ? (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="space-y-1">
            <span className="block text-xs text-neutral-600">Max nodes/diagram</span>
            <input
              type="number"
              min={4}
              max={60}
              value={auto.maxNodes}
              onChange={handleAutoChange('maxNodes')}
              className="w-full h-10 rounded border border-neutral-300 px-3"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-neutral-600">Max edges/diagram</span>
            <input
              type="number"
              min={4}
              max={120}
              value={auto.maxEdges}
              onChange={handleAutoChange('maxEdges')}
              className="w-full h-10 rounded border border-neutral-300 px-3"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-neutral-600">Target density</span>
            <input
              type="number"
              step="0.1"
              min={0.2}
              max={5}
              value={auto.targetDensity}
              onChange={handleAutoChange('targetDensity')}
              className="w-full h-10 rounded border border-neutral-300 px-3"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-neutral-600">Max bridge edges</span>
            <input
              type="number"
              min={0}
              max={12}
              value={auto.maxBridges}
              onChange={handleAutoChange('maxBridges')}
              className="w-full h-10 rounded border border-neutral-300 px-3"
            />
          </label>
        </div>
      ) : null}
      {mode === 'byCount' ? (
        <div className="grid grid-cols-3 gap-3 text-sm">
          <label className="space-y-1">
            <span className="block text-xs text-neutral-600">Diagrams (k)</span>
            <input
              type="number"
              min={1}
              max={10}
              value={byCount.k}
              onChange={handleByCountChange('k')}
              className="w-full h-10 rounded border border-neutral-300 px-3"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-neutral-600">Max nodes</span>
            <input
              type="number"
              min={4}
              max={60}
              value={byCount.maxNodes}
              onChange={handleByCountChange('maxNodes')}
              className="w-full h-10 rounded border border-neutral-300 px-3"
            />
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-neutral-600">Max edges</span>
            <input
              type="number"
              min={4}
              max={120}
              value={byCount.maxEdges}
              onChange={handleByCountChange('maxEdges')}
              className="w-full h-10 rounded border border-neutral-300 px-3"
            />
          </label>
        </div>
      ) : null}
    </section>
  );
};
