'use client';

import React from 'react';
import type { LectureOutline } from '@/types/lecture';

export interface OutlineEditorProps {
  outline: LectureOutline | null;
  onChange: (outline: LectureOutline) => void;
  onWriteScripts: () => void;
  writing: boolean;
}

function listToTextarea(items: string[]): string {
  return items.join('\n');
}

function textareaToList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function OutlineEditor({ outline, onChange, onWriteScripts, writing }: OutlineEditorProps) {
  if (!outline) {
    return (
      <section className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-sm text-neutral-600">
        Outline will appear here after planning.
      </section>
    );
  }

  const update = (changes: Partial<LectureOutline>) => {
    onChange({ ...outline, ...changes });
  };

  const updateSection = (sectionId: string, field: 'title' | 'goal' | 'targetDurationSec', value: string) => {
    const nextSections = outline.sections.map((section) => {
      if (section.id !== sectionId) return section;
      if (field === 'targetDurationSec') {
        const minutes = Math.max(1, Number(value));
        return { ...section, targetDurationSec: Math.round(minutes * 60) };
      }
      return { ...section, [field]: value };
    });
    update({ sections: nextSections });
  };

  const minutes = (secs: number) => Math.round(secs / 60);

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Lecture Outline</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Edit title, objectives, or adjust section durations before scripting.
          </p>
        </div>
        <button
          type="button"
          onClick={onWriteScripts}
          disabled={writing}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-black px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {writing ? 'Writing scripts…' : 'Write Scripts'}
        </button>
      </div>
      <div className="mt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium" htmlFor="outline-title">
            Title
          </label>
          <input
            id="outline-title"
            value={outline.title}
            onChange={(e) => update({ title: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="outline-prereq">
            Prerequisites
          </label>
          <textarea
            id="outline-prereq"
            rows={3}
            value={listToTextarea(outline.prerequisites)}
            onChange={(e) => update({ prerequisites: textareaToList(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="outline-objectives">
            Learning objectives
          </label>
          <textarea
            id="outline-objectives"
            rows={4}
            value={listToTextarea(outline.learningObjectives)}
            onChange={(e) => update({ learningObjectives: textareaToList(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </div>
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Sections</h3>
          {outline.sections.map((section) => (
            <div key={section.id} className="rounded-lg border border-neutral-200 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium" htmlFor={`section-title-${section.id}`}>
                    Section title
                  </label>
                  <input
                    id={`section-title-${section.id}`}
                    value={section.title}
                    onChange={(e) => updateSection(section.id, 'title', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium" htmlFor={`section-goal-${section.id}`}>
                    Goal
                  </label>
                  <textarea
                    id={`section-goal-${section.id}`}
                    rows={2}
                    value={section.goal}
                    onChange={(e) => updateSection(section.id, 'goal', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium" htmlFor={`section-duration-${section.id}`}>
                    Target minutes
                  </label>
                  <input
                    id={`section-duration-${section.id}`}
                    type="number"
                    min={1}
                    max={60}
                    value={minutes(section.targetDurationSec)}
                    onChange={(e) => updateSection(section.id, 'targetDurationSec', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
