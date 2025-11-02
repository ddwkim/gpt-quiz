'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { LectureManifest, TTSSegment } from '@/types/lecture';

export interface LecturePlayerProps {
  manifest: LectureManifest | null;
  onGenerateQuiz?: () => void;
  onRegenerateSection?: (sectionId: string) => void;
}

function groupBySection(segments: TTSSegment[]) {
  const map = new Map<string, TTSSegment[]>();
  for (const segment of segments) {
    const list = map.get(segment.sectionId) ?? [];
    list.push(segment);
    map.set(segment.sectionId, list);
  }
  return map;
}

export function LecturePlayer({ manifest, onGenerateQuiz, onRegenerateSection }: LecturePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentSrc, setCurrentSrc] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!manifest) return;
    const defaultSrc =
      manifest.audio.full ??
      (manifest.segments.length ? `${manifest.audio.segmentsDir}/${manifest.segments[0].fileName}` : null);
    setCurrentSrc(defaultSrc);
  }, [manifest]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  if (!manifest) {
    return (
      <section className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-sm text-neutral-600">
        Generate audio to preview the lecture with captions and chapter controls.
      </section>
    );
  }

  const segmentsBySection = groupBySection(manifest.segments);
  const fullDownload = manifest.audio.full;
  const quizHref = `/api/quiz?fromLecture=${manifest.id}`;

  const handleGenerateQuiz = () => {
    if (onGenerateQuiz) {
      onGenerateQuiz();
      return;
    }
    if (manifest.sourceUrl) {
      router.push(`/?share=${encodeURIComponent(manifest.sourceUrl)}`);
    }
  };

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">{manifest.outline.title}</h2>
          <p className="mt-1 text-sm text-neutral-600">
            {manifest.outline.learningObjectives.length} objectives · {manifest.outline.sections.length} sections ·{' '}
            {Math.round(manifest.outline.totalTargetSec / 60)} minutes target
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleGenerateQuiz}
            className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Generate quiz from lecture
          </button>
          {fullDownload ? (
            <a
              href={fullDownload}
              download
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Download full audio
            </a>
          ) : null}
          {manifest.captions?.vtt ? (
            <a
              href={manifest.captions.vtt}
              download
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Download captions (.vtt)
            </a>
          ) : null}
          {manifest.captions?.srt ? (
            <a
              href={manifest.captions.srt}
              download
              className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Download captions (.srt)
            </a>
          ) : null}
        </div>
      </header>
      <div className="mt-4 space-y-4">
        <div className="rounded-lg border border-neutral-200 p-4">
          <audio ref={audioRef} controls className="w-full" src={currentSrc ?? undefined}>
            {captionsEnabled && manifest.captions?.vtt ? (
              <track kind="captions" src={manifest.captions.vtt} srcLang={manifest.lang} default />
            ) : null}
          </audio>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-neutral-600">
            <label className="flex items-center gap-2">
              Speed
              <select
                value={playbackRate}
                onChange={(e) => setPlaybackRate(Number(e.target.value))}
                className="rounded border border-neutral-300 px-2 py-1"
              >
                {[0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
                  <option key={rate} value={rate}>
                    {rate.toFixed(2)}×
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={captionsEnabled}
                onChange={(e) => setCaptionsEnabled(e.target.checked)}
              />
              Captions
            </label>
            <Link
              href={quizHref}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Quiz pipeline (GET)
            </Link>
          </div>
        </div>
        <div className="space-y-3">
          {manifest.outline.sections.map((section, idx) => {
            const sectionSegments = segmentsBySection.get(section.id) ?? [];
            return (
              <div key={section.id} className="rounded-lg border border-neutral-200 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {idx + 1}. {section.title}
                    </h3>
                    <p className="text-sm text-neutral-600">{section.goal}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600">
                      {Math.round(section.targetDurationSec / 60)} min
                    </span>
                    {onRegenerateSection ? (
                      <button
                        type="button"
                        onClick={() => onRegenerateSection(section.id)}
                        className="rounded border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                      >
                        Regenerate section
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {sectionSegments.map((segment) => {
                    const src = `${manifest.audio.segmentsDir}/${segment.fileName}`;
                    return (
                      <button
                        key={segment.fileName}
                        type="button"
                        onClick={() => setCurrentSrc(src)}
                        className={`rounded border px-3 py-2 text-xs font-medium ${
                          currentSrc === src ? 'border-blue-500 text-blue-600' : 'border-neutral-200 text-neutral-700'
                        }`}
                      >
                        {segment.fileName}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
