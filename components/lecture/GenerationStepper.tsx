'use client';

import React from 'react';

export type StepStatus = 'idle' | 'pending' | 'done' | 'error';

export interface GenerationStep {
  id: string;
  label: string;
  status: StepStatus;
  message?: string;
}

const statusStyles: Record<StepStatus, string> = {
  idle: 'bg-neutral-200 text-neutral-600',
  pending: 'bg-blue-100 text-blue-700',
  done: 'bg-emerald-100 text-emerald-700',
  error: 'bg-red-100 text-red-700'
};

export function GenerationStepper({ steps }: { steps: GenerationStep[] }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-neutral-600">Progress</h2>
      <ol className="mt-3 flex flex-wrap items-center gap-2">
        {steps.map((step) => (
          <li key={step.id} className="flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${statusStyles[step.status]}`}>
              {step.label}
            </span>
            {step.message ? <span className="text-xs text-neutral-500">{step.message}</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
