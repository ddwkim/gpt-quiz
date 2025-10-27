import { DiagramIRSchema, type DiagramIR } from '@/lib/mermaid/schema';
import { callJson } from '@/lib/openai-client';

export const REFINE_SYSTEM = `
You correct invalid JSON IR for a Mermaid flowchart using the reported parser error and accumulated reasons[].
Return ONLY JSON that matches the provided IR schema. Do not output Mermaid or commentary.

Policy:
- Preserve the intended content and focus. If budgets are implied, drop lowest-weight items first, keep must-include items.
- Keep IDs in ^[A-Za-z0-9_]+$, labels concise, ASCII punctuation. You may add weight/group to guide priority/grouping.
- Do not reintroduce reasons listed in reasons[].
`;

export type Reason = { code: string; message: string };

export function buildRefineUserPrompt(badIR: string, parserError: string, reasons: Reason[]) {
  return [
    `Here is the last IR (JSON):`,
    badIR,
    `Mermaid parser error message:`,
    parserError,
    `Accumulated reasons to avoid (oldest→newest):`,
    JSON.stringify(reasons, null, 2),
    `Return corrected IR JSON only.`
  ].join('\n\n');
}

export async function refineIRJSON(
  badIR: any,
  parserError: string,
  reasons: Reason[],
  model?: string
): Promise<DiagramIR> {
  const user = buildRefineUserPrompt(JSON.stringify(badIR), parserError, reasons);
  const ir = await callJson<DiagramIR>({
    system: REFINE_SYSTEM,
    user,
    schema: DiagramIRSchema,
    model,
    parser: { parse: (x: any) => x } as any,
    agent: 'IR_Refine'
  });
  return ir;
}
