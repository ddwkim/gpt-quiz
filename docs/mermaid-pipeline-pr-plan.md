# Mermaid Pipeline Refactor — Incremental PR Plan

## Overview
- Target branch: `main`
- Base assumptions: Node 18+, pnpm workspace, Vitest + ESLint + Prettier enforced in CI.
- Shared rollout guardrails: each PR lands behind `MERMAID_FORCE_DAGRE` and `MERMAID_REFINE_ONLY` escape hatches; telemetry gated to info-level logging initially.

## PR#1 — Schema & Canonicalization Foundations
- **Scope**: introduce `lib/ir/schema.ts`, `lib/ir/canonicalize.ts`; update pipeline build loop to canonicalize after every agent emission; add canonicalization golden tests.
- **Tests**: `pnpm vitest run tests/golden/canonicalize.spec.ts`; `pnpm lint`.
- **Rollback Note**: Revert entire PR to restore original IR handling; no downstream modules depend on new schema.

## PR#2 — Compiler & Validation Hardening
- **Scope**: rewrite `lib/mermaid/compiler.ts` for v10 bracket syntax, canonical arrows, per-subgraph direction heuristic; add `lib/mermaid/validate.ts`; update runtime sanitization order.
- **Tests**: `pnpm vitest run tests/golden/compiler.spec.ts`; `pnpm vitest run tests/property/compiler_labels.spec.ts`.
- **Rollback Note**: Remove new compiler/validate changes and revert runtime adjustments; reverts restore previous Mermaid output albeit with legacy parse issues.

## PR#3 — Static Lint & Structural Mutators
- **Scope**: extend `lib/mermaid/check.ts` with normalized codes and new rules; add `lib/mermaid/mutators.ts`; integrate mutators into build loop; cover mutator behavior with property tests.
- **Tests**: `pnpm vitest run tests/property/mutators.spec.ts`; `pnpm vitest run tests/golden/lint_failures.spec.ts`.
- **Rollback Note**: Revert mutator integration and new lint codes; ensures build loop mirrors current behavior (LLM-only retries).

## PR#4 — Renderer Config & Server Heuristics
- **Scope**: update `lib/mermaid/server.ts` to initialize Mermaid with strict security, renderer heuristic, worker pool; enforce parse gate via `validateMermaid`; adjust render memory helpers as needed.
- **Tests**: `pnpm vitest run tests/server/renderer.spec.ts`; `pnpm vitest run tests/server/parse_gate.spec.ts`.
- **Rollback Note**: Remove worker pool and heuristic changes; restore previous single-shot rendering flow.

## PR#5 — Focus Selection & Agent Prompts
- **Scope**: enhance `lib/focus/select.ts` scoring, materialize stub nodes for must-include; update all four agent prompt templates with new schema constraints and ID preservation rules.
- **Tests**: `pnpm vitest run tests/focus/select.spec.ts`; `pnpm vitest run tests/agents/prompt_invariants.spec.ts`.
- **Rollback Note**: Revert prompt and focus changes; fall back to prior heuristics (no canonical stub protection).

## PR#6 — Observability, Docs, Migration
- **Scope**: add `lib/metrics/telemetry.ts`, instrument pipeline; create `docs/mermaid-migration-10x.md`; expand golden/property suites to 100+ samples; ensure CI scripts updated.
- **Tests**: `pnpm vitest run`; `pnpm lint`; optional `pnpm coverage`.
- **Rollback Note**: Remove telemetry wiring and docs; leave functional pipeline intact.

## Release Checklist
- Verify `MERMAID_FORCE_DAGRE` fallback works in staging.
- Capture baseline telemetry dashboards before enabling 100% traffic.
- Communicate new invariants to downstream teams via migration doc.
