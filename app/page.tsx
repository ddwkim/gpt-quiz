"use client";

import React, { useEffect, useState } from "react";
import DiagramView from "@/components/Diagram";
import QuizView from "@/components/Quiz";
import type { Diagram } from "@/lib/diagram";
import type { Quiz } from "@/lib/types";

// Shared Card component for consistent styling
function Card({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-neutral-200 bg-white p-6 shadow-sm overflow-hidden ${className}`}>
      <h2 className="text-xl font-semibold">{title}</h2>
      {description ? (
        <p className="mt-1 text-sm text-neutral-600">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

const SHARE_RE = /^https:\/\/chatgpt\.com\/share\/[a-f0-9-]{16,}$/i;

async function generateQuiz({
  shareLink,
  form,
}: {
  shareLink: string;
  form: any;
}) {
  const res = await fetch("/api/quiz", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shareUrl: shareLink, config: form, hq: !!form?.hq }),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message =
      data?.error?.message ?? (typeof data === "string" ? data : text) ?? "Quiz generation failed";
    throw new Error(message);
  }
  return (data ?? {}) as Quiz;
}

async function generateDiagram({
  shareLink,
  form,
}: {
  shareLink: string;
  form: any;
}) {
  const res = await fetch("/api/diagram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shareUrl: shareLink, config: form }),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const message =
      data?.error?.message ?? (typeof data === "string" ? data : text) ?? "Diagram generation failed";
    throw new Error(message);
  }
  return (data ?? {}) as Diagram;
}

function Select({
  id,
  value,
  onChange,
  children,
}: {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={onChange}
        className="appearance-none w-full h-11 rounded-lg border border-neutral-300 pl-3 pr-10"
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute inset-y-0 right-3 my-auto h-4 w-4 text-neutral-500"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M5.5 7.5l4.5 4.5 4.5-4.5" />
      </svg>
    </div>
  );
}

function LinkInputCard({
  sharedLink,
  setSharedLink,
  isValidLink,
  setIsValidLink,
  manualMode,
  setManualMode,
  manualTranscript,
  setManualTranscript,
}: {
  sharedLink: string;
  setSharedLink: (v: string) => void;
  isValidLink: boolean;
  setIsValidLink: (b: boolean) => void;
  manualMode: boolean;
  setManualMode: (b: boolean) => void;
  manualTranscript: string;
  setManualTranscript: (v: string) => void;
}) {
  const [local, setLocal] = useState(sharedLink);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocal(sharedLink);
  }, [sharedLink]);

  useEffect(() => {
    if (manualMode) {
      const ok = manualTranscript.trim().length > 0;
      setError(ok ? null : "Paste transcript content");
      setIsValidLink(ok);
      return;
    }
    if (!local) {
      setError("Enter a ChatGPT shared link");
      setIsValidLink(false);
      return;
    }
    if (!SHARE_RE.test(local)) {
      setError("Link must match https://chatgpt.com/share/<uuid>");
      setIsValidLink(false);
    } else {
      setError(null);
      setIsValidLink(true);
    }
  }, [local, setIsValidLink, manualMode, manualTranscript]);

  return (
    <Card
      title="ChatGPT Shared Link"
      description="Paste a https://chatgpt.com/share/<uuid> link. This enables the generators below."
    >
      <div className="space-y-3">
        <label className="block text-sm font-medium" htmlFor="shared-link">
          Shared Link
        </label>
        <input
          id="shared-link"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => setSharedLink(local)}
          className="w-full h-11 rounded-lg border border-neutral-300 px-3"
          placeholder="https://chatgpt.com/share/68fdf14f-..."
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={manualMode}
            onChange={(e) => setManualMode(e.target.checked)}
            className="h-4 w-4"
          />
          Manual transcript input
        </label>

        {manualMode && (
          <div className="mt-3">
            <label htmlFor="manual-transcript" className="block text-sm font-medium">
              Transcript
            </label>
            <textarea
              id="manual-transcript"
              value={manualTranscript}
              onChange={(e) => setManualTranscript(e.target.value)}
              rows={6}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2"
              placeholder="Paste conversation text here (e.g., lines prefixed with user:/assistant:)"
            />
          </div>
        )}
      </div>
    </Card>
  );
}

function GenerateQuizCard({
  sharedLink,
  isValidLink,
  onQuiz,
  manualMode,
  manualTranscript,
}: {
  sharedLink: string;
  isValidLink: boolean;
  onQuiz: React.Dispatch<React.SetStateAction<Quiz | null>>;
  manualMode: boolean;
  manualTranscript: string;
}) {
  const [nQuestions, setNQuestions] = useState(8);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "mixed">("mixed");
  const [lang, setLang] = useState<"en" | "ko">("en");
  const [seed, setSeed] = useState<number | "">("");
  const [mix, setMix] = useState<{ mcq: boolean; true_false: boolean; short_answer: boolean }>(
    { mcq: true, true_false: true, short_answer: true }
  );
  const [hq, setHq] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const disabled = !isValidLink || busy;

  const toggleMix = (type: "mcq" | "true_false" | "short_answer") => {
    setMix((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    onQuiz(null);
    try {
      if (nQuestions < 1 || nQuestions > 50)
        throw new Error("# Questions must be between 1 and 50");
      const selected = Object.entries(mix)
        .filter(([_, checked]) => checked)
        .map(([type]) => type);
      if (!selected.length) throw new Error("Select at least one item type");

      const payload: any = {
        config: {
          n_questions: nQuestions,
          difficulty,
          mix: selected,
          lang,
          seed: seed === "" ? undefined : Number(seed),
          hq,
        },
      };
      if (manualMode) payload.transcript = manualTranscript;
      else payload.shareUrl = sharedLink;
      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let quiz: any = null;
      try {
        quiz = text ? JSON.parse(text) : null;
      } catch {}
      if (!res.ok) throw new Error(quiz?.error?.message ?? text ?? "Quiz generation failed");
      onQuiz(quiz);
      setMessage(quiz.title ? `Quiz generated: ${quiz.title}` : "Quiz generated successfully.");
    } catch (err: any) {
      setError(err?.message ?? "Quiz generation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Generate Quiz" description="Configure quiz generation and run it.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="quiz-questions" className="block text-sm font-medium">
              # Questions
            </label>
            <input
              id="quiz-questions"
              type="number"
              min={1}
              max={50}
              value={nQuestions}
              onChange={(e) => setNQuestions(Number(e.target.value))}
              className="mt-1 w-full h-11 rounded-lg border border-neutral-300 px-3"
            />
          </div>
          <div>
            <label htmlFor="quiz-difficulty" className="block text-sm font-medium">
              Difficulty
            </label>
            <Select id="quiz-difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value as any)}>
              <option value="easy">easy</option>
              <option value="medium">medium</option>
              <option value="hard">hard</option>
              <option value="mixed">mixed</option>
            </Select>
          </div>
          <div>
            <label htmlFor="quiz-language" className="block text-sm font-medium">
              Language
            </label>
            <Select id="quiz-language" value={lang} onChange={(e) => setLang(e.target.value as any)}>
              <option value="en">English</option>
              <option value="ko">Korean</option>
            </Select>
          </div>
          <div>
            <label htmlFor="quiz-seed" className="block text-sm font-medium">
              Seed
            </label>
            <input
              id="quiz-seed"
              type="number"
              value={seed}
              onChange={(e) => setSeed(e.target.value === "" ? "" : Number(e.target.value))}
              className="mt-1 w-full h-11 rounded-lg border border-neutral-300 px-3"
            />
          </div>
          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-medium">Item types</legend>
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4" checked={mix.mcq} onChange={() => toggleMix("mcq")} />
                mcq
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={mix.true_false}
                  onChange={() => toggleMix("true_false")}
                />
                true_false
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={mix.short_answer}
                  onChange={() => toggleMix("short_answer")}
                />
                short_answer
              </label>
            </div>
          </fieldset>
          <label className="inline-flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="h-4 w-4" checked={hq} onChange={(e) => setHq(e.target.checked)} />
            High-quality pipeline
          </label>
          <div className="sm:col-span-2 mt-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={disabled}
              className="inline-flex items-center justify-center h-10 px-4 rounded-lg bg-black text-white whitespace-nowrap max-w-max shrink-0 disabled:opacity-50"
            >
              {busy ? "Generating…" : "Generate Quiz"}
            </button>
            {error && <span className="text-sm text-red-600">{error}</span>}
            {!error && message && <span className="text-sm text-green-600">{message}</span>}
          </div>
        </div>
      </form>
    </Card>
  );
}

function GenerateDiagramCard({
  sharedLink,
  isValidLink,
  onDiagram,
  manualMode,
  manualTranscript,
}: {
  sharedLink: string;
  isValidLink: boolean;
  onDiagram: React.Dispatch<React.SetStateAction<Diagram | null>>;
  manualMode: boolean;
  manualTranscript: string;
}) {
  const [type, setType] = useState<"flowchart" | "sequence" | "class" | "er" | "state" | "mindmap">("flowchart");
  const [focus, setFocus] = useState<"overview" | "process" | "concept">("overview");
  const [lang, setLang] = useState<"en" | "ko">("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const disabled = !isValidLink || busy;

  const typeHelp: Record<typeof type, string> = {
    flowchart: "Process flow: boxes and arrows for step‑by‑step logic.",
    sequence: "Interaction timeline: who talks to whom, and when.",
    class: "Data model: types, fields, and relationships.",
    er: "Entities & relationships: tables/entities and how they link.",
    state: "States & transitions: lifecycle and allowed changes.",
    mindmap: "Idea map: nested nodes showing concepts and parts.",
  } as any;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      let result: any;
      if (manualMode) {
        const res = await fetch("/api/diagram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: manualTranscript, config: { type, focus, lang } }),
        });
        const txt = await res.text();
        let data: any = null;
        try {
          data = txt ? JSON.parse(txt) : null;
        } catch {}
        if (!res.ok) throw new Error(data?.error?.message ?? txt ?? "Diagram generation failed");
        result = data;
      } else {
        result = await generateDiagram({ shareLink: sharedLink, form: { type, focus, lang } });
      }
      onDiagram({
        ...result,
        metadata: {
          ...(result.metadata ?? {}),
          diagram_type: type,
        },
      } as Diagram);
      setMessage(result?.title ? `Diagram generated: ${result.title}` : "Diagram generated successfully.");
    } catch (err: any) {
      setError(err?.message ?? "Diagram generation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Generate Diagram" description="Create a Mermaid diagram that summarizes the transcript visually.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="diagram-type" className="block text-sm font-medium">
              Type
            </label>
            <Select id="diagram-type" value={type} onChange={(e) => setType(e.target.value as any)}>
              <option value="flowchart">flowchart</option>
              <option value="sequence">sequence</option>
              <option value="class">class</option>
              <option value="er">er</option>
              <option value="state">state</option>
              <option value="mindmap">mindmap</option>
            </Select>
            <p className="mt-1 text-xs text-neutral-600">{typeHelp[type]}</p>
          </div>
          <div>
            <label htmlFor="diagram-focus" className="block text-sm font-medium">
              Focus
            </label>
            <Select id="diagram-focus" value={focus} onChange={(e) => setFocus(e.target.value as any)}>
              <option value="overview">overview</option>
              <option value="process">process</option>
              <option value="concept">concept</option>
            </Select>
          </div>
          <div>
            <label htmlFor="diagram-lang" className="block text-sm font-medium">
              Language
            </label>
            <Select id="diagram-lang" value={lang} onChange={(e) => setLang(e.target.value as any)}>
              <option value="en">English</option>
              <option value="ko">Korean</option>
            </Select>
          </div>
          <div className="sm:col-span-3 mt-2 flex items-center gap-3">
            <button
              type="submit"
              disabled={disabled}
              className="inline-flex items-center justify-center h-10 px-4 rounded-lg bg-black text-white whitespace-nowrap max-w-max shrink-0 disabled:opacity-50"
            >
              {busy ? "Generating…" : "Generate Diagram"}
            </button>
            {error && <span className="text-sm text-red-600">{error}</span>}
            {!error && message && <span className="text-sm text-green-600">{message}</span>}
          </div>
        </div>
      </form>
    </Card>
  );
}

export default function Page() {
  const [sharedLink, setSharedLink] = useState("");
  const [isValidLink, setIsValidLink] = useState(false);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [diagram, setDiagram] = useState<Diagram | null>(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualTranscript, setManualTranscript] = useState("");

  useEffect(() => {
    setQuiz(null);
    setDiagram(null);
  }, [sharedLink]);

  return (
    <main className="mx-auto max-w-[1200px] px-6 py-8 space-y-6">
      <header>
        <h1 className="text-3xl font-semibold">Quiz & Diagram from ChatGPT Shared Link</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Paste a https://chatgpt.com/share/&lt;uuid&gt; link and generate learning artifacts.
        </p>
      </header>

      <LinkInputCard
        sharedLink={sharedLink}
        setSharedLink={setSharedLink}
        isValidLink={isValidLink}
        setIsValidLink={setIsValidLink}
        manualMode={manualMode}
        setManualMode={setManualMode}
        manualTranscript={manualTranscript}
        setManualTranscript={setManualTranscript}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <GenerateQuizCard
          sharedLink={sharedLink}
          isValidLink={isValidLink}
          onQuiz={setQuiz}
          manualMode={manualMode}
          manualTranscript={manualTranscript}
        />
        <GenerateDiagramCard
          sharedLink={sharedLink}
          isValidLink={isValidLink}
          onDiagram={setDiagram}
          manualMode={manualMode}
          manualTranscript={manualTranscript}
        />
      </div>

      <div className="space-y-6">
        {quiz && <QuizView quiz={quiz} />}
        {diagram && <DiagramView diagram={diagram} />}
      </div>
    </main>
  );
}
