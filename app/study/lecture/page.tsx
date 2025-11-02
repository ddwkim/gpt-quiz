'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { LectureForm, defaultLectureFormState, type LectureFormState } from '@/components/lecture/LectureForm';
import { OutlineEditor } from '@/components/lecture/OutlineEditor';
import { ScriptEditor } from '@/components/lecture/ScriptEditor';
import { GenerationStepper, type GenerationStep } from '@/components/lecture/GenerationStepper';
import { LecturePlayer } from '@/components/lecture/LecturePlayer';
import type { KnowledgeBlock, LectureManifest, LectureOutline, SectionScript } from '@/types/lecture';

type StepKey = 'plan' | 'script' | 'tts' | 'package';

const baselineSteps: GenerationStep[] = [
  { id: 'plan', label: 'Plan', status: 'idle' },
  { id: 'script', label: 'Script', status: 'idle' },
  { id: 'tts', label: 'TTS', status: 'idle' },
  { id: 'package', label: 'Package', status: 'idle' }
];

function resetSteps(): GenerationStep[] {
  return baselineSteps.map((step) => ({ ...step }));
}

export default function LecturePage() {
  const [form, setForm] = useState<LectureFormState>(defaultLectureFormState);
  const [steps, setSteps] = useState<GenerationStep[]>(resetSteps);
  const [blocks, setBlocks] = useState<KnowledgeBlock[]>([]);
  const [outline, setOutline] = useState<LectureOutline | null>(null);
  const [scripts, setScripts] = useState<Record<string, SectionScript> | null>(null);
  const [manifest, setManifest] = useState<LectureManifest | null>(null);
  const [planning, setPlanning] = useState(false);
  const [writing, setWriting] = useState(false);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();

  useEffect(() => {
    const share = searchParams.get('share');
    if (share) {
      setForm((prev) => ({ ...prev, url: share }));
    }
  }, [searchParams]);

  const outlineReady = Boolean(outline);
  const scriptsReady = Boolean(scripts);

  const updateStep = (id: StepKey, status: GenerationStep['status'], message?: string) => {
    setSteps((prev) =>
      prev.map((step) => (step.id === id ? { ...step, status, message } : step))
    );
  };

  const resetAfterPlan = () => {
    setSteps((prev) =>
      prev.map((step) => {
        if (step.id === 'plan') return { ...step, status: 'done', message: undefined };
        return { ...step, status: 'idle', message: undefined };
      })
    );
  };

  const handlePlan = async () => {
    setPlanning(true);
    setError(null);
    setManifest(null);
    setScripts(null);
    updateStep('plan', 'pending', 'Fetching shared link…');
    try {
      const res = await fetch('/api/lecture/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: form.url,
          minutes: form.minutes,
          sections: form.sections,
          audienceLevel: form.audienceLevel,
          language: form.language,
          model: form.plannerModel
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message ?? 'Plan failed');
      }
      setBlocks(data.blocks as KnowledgeBlock[]);
      setOutline(data.outline as LectureOutline);
      if (data.scripts) {
        setScripts(data.scripts as Record<string, SectionScript>);
      } else {
        setScripts(null);
      }
      if (data.manifest) {
        setManifest(data.manifest as LectureManifest);
      } else {
        setManifest(null);
      }
      resetAfterPlan();
      if (data.scripts) {
        updateStep('script', 'done');
      }
      if (data.manifest) {
        updateStep('tts', 'done');
        updateStep('package', 'done');
      }
    } catch (err: any) {
      const message = err?.message ?? 'Failed to plan lecture';
      setError(message);
      updateStep('plan', 'error', message);
    } finally {
      setPlanning(false);
    }
  };

  const handleWriteScripts = async () => {
    if (!outline) return;
    setWriting(true);
    setError(null);
    updateStep('script', 'pending', 'Calling script writer…');
    try {
      const res = await fetch('/api/lecture/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outline,
          blocks,
          rateWpm: form.wordsPerMinute,
          model: form.plannerModel,
          language: form.language
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message ?? 'Script generation failed');
      }
      setScripts(data.scripts as Record<string, SectionScript>);
      updateStep('script', 'done');
    } catch (err: any) {
      const message = err?.message ?? 'Failed to write scripts';
      setError(message);
      updateStep('script', 'error', message);
    } finally {
      setWriting(false);
    }
  };

  const handleGenerateAudio = async () => {
    if (!outline || !scripts) return;
    setGeneratingAudio(true);
    setError(null);
    updateStep('tts', 'pending', 'Synthesizing audio…');
    updateStep('package', 'pending');
    try {
      const res = await fetch('/api/lecture/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          outline,
          scripts,
          tts: {
            model: form.ttsModel,
            voice: form.voice,
            format: form.format,
            concurrency: form.concurrency,
            maxChars: form.maxChars,
            wordsPerMinute: form.wordsPerMinute,
            loudness: -16
          }
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message ?? 'Audio generation failed');
      }
      setManifest(data.manifest as LectureManifest);
      updateStep('tts', 'done');
      updateStep('package', 'done');
    } catch (err: any) {
      const message = err?.message ?? 'Failed to synthesize audio';
      setError(message);
      updateStep('tts', 'error', message);
    } finally {
      setGeneratingAudio(false);
    }
  };

  const stepper = useMemo(() => steps, [steps]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Lecture Generator</h1>
        <p className="text-sm text-neutral-600">
          Create narrated lectures from a ChatGPT shared conversation, with chapters, captions, and quiz handoff.
        </p>
      </header>
      <GenerationStepper steps={stepper} />
      <LectureForm
        value={form}
        onChange={(next) => setForm((prev) => ({ ...prev, ...next }))}
        onPlan={handlePlan}
        planning={planning}
        error={error}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <OutlineEditor outline={outline} onChange={setOutline} onWriteScripts={handleWriteScripts} writing={writing} />
        <ScriptEditor
          outline={outline}
          scripts={scripts}
          onChange={(sectionId, script) =>
            setScripts((prev) => (prev ? { ...prev, [sectionId]: script } : prev))
          }
          onGenerateAudio={handleGenerateAudio}
          generating={generatingAudio}
        />
      </div>
      <LecturePlayer manifest={manifest} />
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
    </main>
  );
}
