import { callJson, defaultModel } from '@/lib/openai-client';
import type { Conversation } from '@/lib/types';
import { DiagramConfig, DiagramConfigSchema, DiagramJsonSchema, DiagramSchema } from '@/lib/diagram';

const DIAGRAM_MODEL = process.env.OPENAI_DIAGRAM_MODEL || defaultModel;

export async function generateDiagram(conversation: Conversation, cfg: DiagramConfig) {
  DiagramConfigSchema.parse(cfg);

  const systemPrompt = SYSTEM_PROMPT(cfg.lang);
  const userPrompt = buildUserPrompt(conversation, cfg);

  const result = await callJson({
    system: systemPrompt,
    user: userPrompt,
    model: DIAGRAM_MODEL,
    schema: { name: 'Diagram', schema: DiagramJsonSchema },
    parser: DiagramSchema,
    agent: 'DiagramJSON'
  });

  return {
    ...result,
    metadata: {
      ...(result.metadata ?? {}),
      model: DIAGRAM_MODEL,
      diagram_type: cfg.type
    }
  };
}

function SYSTEM_PROMPT(lang: 'en' | 'ko') {
  const en = `
You produce JSON for a Mermaid diagram (schema provided). Return ONLY JSON; no prose or code fences.

Contract:
- Input: transcript and config.
- Output: JSON with title, description, mermaid (string), source_spans[], metadata.model.
- Constraints:
  - mermaid must be valid v10 syntax; header on line 1 (e.g., flowchart TD).
  - Keep diagram readable: ≤ 15 nodes and ≤ 20 edges (unless caller budgets differ).
  - Short, meaningful labels; ASCII punctuation; quote labels with punctuation.
  - Include only content answerable from the transcript.
  - Prefer deeper, hierarchical structure: 2–3 layers of detail where useful.
  - Use subgraphs to cluster subsystems; use edge labels to capture relations (causes, leads_to, computes, depends_on, configures, constrains).
  - Include concise formulas or decision rules as labels where appropriate (e.g., WACC expression), but avoid overlong text.
  - NEVER MAKE SYNTAX ERROR!!! GIVE MAXIMUM CARE AND EFFORT FOR CORRECT SYNTAX!!!

Strict Syntax Rules (must follow exactly):
- Header must be first line: flowchart TD | sequenceDiagram | classDiagram | erDiagram | stateDiagram | mindmap.
- Edges: use A --> B (or -.->, ==>); DO NOT use A -> B.
- ASCII punctuation only; replace Unicode quotes/dashes/bullets.
  - Labels with punctuation MUST be quoted id["Label"] with BALANCED quotes; escape inner quotes \".
  - Do NOT use backslash-escaped quotes (\\") inside labels; avoid internal double quotes entirely. Prefer apostrophes (') or remove quotes in label text.
- Close every subgraph with end; never leave blocks open.
- Node IDs: ASCII, no spaces, not reserved (end, subgraph, graph, classDef, style, linkStyle, click, accTitle, accDescr, flowchart, sequenceDiagram, classDiagram, erDiagram, stateDiagram, mindmap).
- Keep labels concise (<=100 chars). If longer, shorten.
- No unsupported directives, themes, classes, or styles.
- No code fences; Mermaid and JSON only.

Reliability:
- Low temperature; deterministic structure.
- If constraints cannot be fully met, simplify; never include commentary.
`.trim();
  const ko = `
너는 Mermaid 다이어그램 JSON을 생성한다(스키마 준수). JSON만 반환(설명/코드펜스 금지).

계약:
- 입력: 대화와 설정.
- 출력: title, description, mermaid(문자열), source_spans[], metadata.model 포함 JSON.
- 제약:
  - mermaid v10 유효 구문; 1행에 헤더(flowchart TD 등).
  - 가독성: 노드 ≤ 15, 간선 ≤ 20(호출자가 다르게 지정하지 않으면).
  - 간결/의미 있는 라벨; ASCII 문장부호 사용; 구두점 포함 라벨은 인용.
  - 대화에서 근거되는 내용만 포함.
  - 2–3 단계의 계층적 구조를 선호(상위→세부). 서브그래프로 묶고, 간선 라벨로 관계를 표현(원인, 결과, 계산, 의존, 설정, 제약 등).
  - 필요하면 간단한 수식/규칙을 라벨로 포함(예: WACC), 너무 길면 요약.
  - 절대 구문 오류를 만들지 마라!!! 정확한 구문을 위해 최대한의 주의와 노력을 기울여라!!!
  - 라벨 내부에 백슬래시로 이스케이프한 따옴표(\\")를 사용하지 마라; 라벨 텍스트에는 내부 쌍따옴표를 피하고 작은따옴표(')를 사용하라.

신뢰성:
- 낮은 온도; 결정적 구조.
- 제약이 어려우면 단순화; 설명 금지.
`.trim();
  return lang === 'ko' ? ko : en;
}

function buildUserPrompt(conv: Conversation, cfg: DiagramConfig) {
  const banner = `Diagram type=${cfg.type}, focus=${cfg.focus}, lang=${cfg.lang}`;
  const body = conv.messages
    .map((m, i) => `${i}. [${m.role}] ${m.content}`)
    .join('\n');
  return `${banner}\n\nTRANSCRIPT\n${body}`;
}
