'use client';

import React from 'react';

export type LectureFormState = {
  url: string;
  minutes: number;
  sections: number;
  audienceLevel: string;
  language: string;
  voice: string;
  plannerModel: string;
  ttsModel: string;
  format: 'mp3' | 'wav' | 'ogg';
  concurrency: number;
  wordsPerMinute: number;
  maxChars: number;
};

export interface LectureFormProps {
  value: LectureFormState;
  onChange: (next: Partial<LectureFormState>) => void;
  onPlan: () => void;
  planning: boolean;
  disabled?: boolean;
  error?: string | null;
}

export const defaultLectureFormState: LectureFormState = {
  url: '',
  minutes: 20,
  sections: 5,
  audienceLevel: 'intermediate',
  language: 'en',
  voice: 'alloy',
  plannerModel: 'gpt-5-2025-08-07',
  ttsModel: 'gpt-4o-mini-tts',
  format: 'mp3',
  concurrency: 3,
  wordsPerMinute: 145,
  maxChars: 600
};

export function LectureForm({ value, onChange, onPlan, planning, disabled, error }: LectureFormProps) {
  const onField = <K extends keyof LectureFormState>(key: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const inputType = e.target instanceof HTMLInputElement && e.target.type === 'number' ? 'number' : 'text';
    const raw = e.target.value;
    onChange({ [key]: inputType === 'number' ? Number(raw) : (raw as LectureFormState[K]) } as Partial<LectureFormState>);
  };

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Lecture Planner</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Paste a ChatGPT shared link and choose duration, audience, and voice. Planning re-renders source text using export-safe defaults.
          </p>
        </div>
      </header>
      <form
        className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2"
        onSubmit={(evt) => {
          evt.preventDefault();
          if (!value.url) return;
          onPlan();
        }}
      >
        <div className="md:col-span-2">
          <label className="block text-sm font-medium" htmlFor="lecture-url">
            GPT shared link
          </label>
          <input
            id="lecture-url"
            type="url"
            required
            value={value.url}
            onChange={onField('url')}
            placeholder="https://chatgpt.com/share/..."
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="lecture-minutes">
            Target minutes
          </label>
          <input
            id="lecture-minutes"
            type="number"
            min={5}
            max={90}
            value={value.minutes}
            onChange={onField('minutes')}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="lecture-sections">
            Sections
          </label>
          <input
            id="lecture-sections"
            type="number"
            min={3}
            max={10}
            value={value.sections}
            onChange={onField('sections')}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="lecture-audience">
            Audience level
          </label>
          <input
            id="lecture-audience"
            value={value.audienceLevel}
            onChange={onField('audienceLevel')}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="lecture-language">
            Language
          </label>
          <select
            id="lecture-language"
            value={value.language}
            onChange={onField('language')}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
          >
            <option value="en">English</option>
            <option value="ko">Korean</option>
            <option value="es">Spanish</option>
            <option value="de">German</option>
            <option value="fr">French</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="lecture-voice">
            Voice
          </label>
          <input
            id="lecture-voice"
            value={value.voice}
            onChange={onField('voice')}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="lecture-model">
            Model (planner & scripts)
          </label>
          <input
            id="lecture-model"
            value={value.plannerModel}
            onChange={onField('plannerModel')}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="lecture-tts-model">
            TTS model
          </label>
          <input
            id="lecture-tts-model"
            value={value.ttsModel}
            onChange={onField('ttsModel')}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="lecture-format">
            Audio format
          </label>
          <select
            id="lecture-format"
            value={value.format}
            onChange={onField('format')}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
          >
            <option value="mp3">MP3</option>
            <option value="wav">WAV</option>
            <option value="ogg">OGG</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="lecture-concurrency">
            TTS concurrency
          </label>
          <input
            id="lecture-concurrency"
            type="number"
            min={1}
            max={6}
            value={value.concurrency}
            onChange={onField('concurrency')}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="lecture-wpm">
            Speech rate (words/min)
          </label>
          <input
            id="lecture-wpm"
            type="number"
            min={90}
            max={220}
            value={value.wordsPerMinute}
            onChange={onField('wordsPerMinute')}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium" htmlFor="lecture-maxchars">
            Max chars per segment
          </label>
          <input
            id="lecture-maxchars"
            type="number"
            min={200}
            max={2000}
            value={value.maxChars}
            onChange={onField('maxChars')}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
          />
        </div>

        <div className="md:col-span-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={planning || disabled || !value.url}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-black px-5 text-sm font-medium text-white disabled:opacity-50"
          >
            {planning ? 'Planning…' : 'Fetch & Plan'}
          </button>
          {error ? <span className="text-sm text-red-600">{error}</span> : null}
        </div>
      </form>
    </section>
  );
}
