'use client';
import React, { useMemo, useState } from 'react';
import { Quiz } from '@/lib/types';

export default function QuizView({ quiz }: { quiz: Quiz }) {
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [showKey, setShowKey] = useState(false);

  const score = useMemo(() => {
    let correct = 0;
    for (const q of quiz.items) {
      const a = answers[q.id];
      if (a === undefined) continue;
      if (q.type === 'mcq' || q.type === 'true_false') {
        if (String(a) === String(q.answer)) correct++;
      } else {
        // crude normalization for short answers
        const gold = String(q.answer).trim().toLowerCase();
        const pred = String(a ?? '').trim().toLowerCase();
        if (gold && pred && (gold === pred)) correct++;
      }
    }
    return { correct, total: quiz.items.length };
  }, [answers, quiz.items]);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold">{quiz.title ?? 'Generated Quiz'}</h2>
        <p className="text-sm text-gray-600">{quiz.description ?? 'Answer the items below. Use “Reveal key” to see rationales.'}</p>
        <p className="text-sm">Score: {score.correct} / {score.total}</p>
      </header>

      <ol className="list-decimal space-y-5 pl-5">
        {quiz.items.map((q) => (
          <li key={q.id} className="rounded-lg border p-4">
            <div className="mb-2 font-medium">{stripLeadingNumber(q.prompt)}</div>
            {q.type === 'mcq' && (
              <div className="space-y-2">
                {q.choices?.map((c, i) => (
                  <label key={i} className="flex items-center gap-2">
                    <input type="radio" name={q.id}
                      checked={answers[q.id] === i}
                      onChange={() => setAnswers(a => ({ ...a, [q.id]: i }))} />
                    <span>{c}</span>
                  </label>
                ))}
              </div>
            )}
            {q.type === 'true_false' && (
              <div className="space-x-4">
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name={q.id}
                    checked={answers[q.id] === true}
                    onChange={() => setAnswers(a => ({ ...a, [q.id]: true }))} /> True
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name={q.id}
                    checked={answers[q.id] === false}
                    onChange={() => setAnswers(a => ({ ...a, [q.id]: false }))} /> False
                </label>
              </div>
            )}
            {q.type === 'short_answer' && (
              <input
                className="mt-1 w-full rounded-md border px-3 py-2"
                placeholder="Your answer"
                value={answers[q.id] ?? ''}
                onChange={(e) => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
              />
            )}

            {showKey && (
              <div className="mt-3 space-y-1 text-sm text-gray-700">
                <div className="font-medium">Answer: <code>{String(q.answer)}</code></div>
                {q.rationale && <div>Why: {q.rationale}</div>}
                {q.source_spans?.length ? (
                  <div className="text-gray-500">Source spans: {q.source_spans.map(s => `[${s[0]},${s[1]}]`).join(', ')}</div>
                ) : null}
              </div>
            )}
          </li>
        ))}
      </ol>

      <div className="flex gap-3">
        <button onClick={() => setAnswers({})} className="rounded-md border px-4 py-2">Reset</button>
        <button onClick={() => setShowKey(v => !v)} className="rounded-md border px-4 py-2">
          {showKey ? 'Hide key' : 'Reveal key'}
        </button>
      </div>
    </div>
  );
}

function stripLeadingNumber(s: string) {
  return String(s ?? '').replace(/^\s*\d+[\.\)]\s+/, '');
}
