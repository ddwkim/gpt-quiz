'use client';

import React from 'react';
import type { LectureOutline, SectionScript } from '@/types/lecture';

export interface ScriptEditorProps {
  outline: LectureOutline | null;
  scripts: Record<string, SectionScript> | null;
  onChange: (sectionId: string, script: SectionScript) => void;
  onGenerateAudio: () => void;
  generating: boolean;
}

function scriptToTextarea(script: SectionScript | undefined): string {
  if (!script) return '';
  return script.paragraphs.join('\n\n');
}

function textareaToScript(text: string, existing: SectionScript): SectionScript {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return {
    ...existing,
    paragraphs: paragraphs.length ? paragraphs : ['[pause]']
  };
}

export function ScriptEditor({ outline, scripts, onChange, onGenerateAudio, generating }: ScriptEditorProps) {
  if (!outline || !scripts) {
    return (
      <section className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-sm text-neutral-600">
        Scripts appear after running “Write Scripts”.
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Narration Scripts</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Adjust paragraphs or insert <code>[pause]</code> markers. Each section converts into multiple TTS segments.
          </p>
        </div>
        <button
          type="button"
          onClick={onGenerateAudio}
          disabled={generating}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-black px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {generating ? 'Generating audio…' : 'Generate Audio'}
        </button>
      </div>
      <div className="mt-4 space-y-4">
        {outline.sections.map((section) => {
          const script = scripts[section.id];
          return (
            <div key={section.id} className="rounded-lg border border-neutral-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{section.title}</h3>
                  <p className="text-sm text-neutral-600">{section.goal}</p>
                </div>
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
                  {Math.round(section.targetDurationSec / 60)} min
                </span>
              </div>
              <textarea
                rows={8}
                value={scriptToTextarea(script)}
                onChange={(e) => {
                  if (!script) return;
                  onChange(section.id, textareaToScript(e.target.value, script));
                }}
                className="mt-3 w-full rounded-lg border border-neutral-300 px-3 py-2 font-mono text-sm"
              />
              {script?.quizlets?.length ? (
                <div className="mt-3">
                  <h4 className="text-sm font-semibold">Quick checks</h4>
                  <ul className="mt-1 space-y-1 text-sm text-neutral-700">
                    {script.quizlets.map((item, idx) => (
                      <li key={idx}>
                        Q: {item.question} <span className="text-neutral-500">A: {item.answer}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
