import type { DiagramIR, FlowchartIR } from './schema';

function getIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

const esc = (s: string) =>
  String(s)
    .replace(/[“”«»„‟]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/…/g, '...')
    .replace(/"/g, '\\"');

function wordWrap(text: string, width: number, maxLines: number): string {
  if (width <= 0 || maxLines <= 0) return text;
  const words = String(text).split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if (current.length === 0) {
      current = w;
    } else if ((current + ' ' + w).length <= width) {
      current += ' ' + w;
    } else {
      lines.push(current);
      current = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (words.length && lines.join(' ').length < text.length && lines.length >= maxLines) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.length >= 2 ? last.slice(0, Math.max(0, width - 1)) + '…' : last + '…';
  }
  return lines.join('<br/>');
}

function wrapNodeLabel(text: string, widthChars: number, maxLines: number): string {
  if (widthChars <= 0 || maxLines <= 0) return esc(text);
  return esc(wordWrap(text, widthChars, maxLines));
}

function wrapEdgeLabel(text: string, widthChars: number): string {
  const s = esc(text);
  if (widthChars <= 0 || s.length <= widthChars) return s;
  return s.slice(0, Math.max(0, widthChars - 1)) + '…';
}

function compileFlowchart(ir: FlowchartIR): string {
  const defaultWrap = getIntEnv('MERMAID_LABEL_WRAP', 28);
  const defaultMaxLines = getIntEnv('MERMAID_LABEL_MAX_LINES', 4);
  const nodeWrap = ir.style?.wrapLabelsAt ?? defaultWrap;
  const maxLines = defaultMaxLines;
  const edgeWrap = Math.max(nodeWrap, getIntEnv('MERMAID_EDGE_LABEL_WRAP', 40));
  const out: string[] = [`flowchart ${ir.direction}`];

  // nodes
  for (const nd of ir.nodes) {
    out.push(`${nd.id}["${wrapNodeLabel(nd.label, nodeWrap, maxLines)}"]`);
    if (nd.note) out.push(`%% note ${nd.id}: ${wrapEdgeLabel(nd.note, Math.max(edgeWrap, 80))}`);
  }

  // subgraphs
  if (ir.subgraphs?.length) {
    for (const sg of ir.subgraphs) {
      out.push(`subgraph ${sg.id}["${wrapNodeLabel(sg.title, nodeWrap, maxLines)}"]`);
      for (const nid of sg.nodes) out.push(`  ${nid}`);
      out.push('end');
    }
  }

  // optional: group-focused nodes into subgraphs by node.group
  const groups = new Map<string, string[]>();
  for (const nd of ir.nodes) {
    if (nd.group) {
      const list = groups.get(nd.group) || [];
      list.push(nd.id);
      groups.set(nd.group, list);
    }
  }
  if (groups.size > 0) {
    for (const [g, ids] of groups.entries()) {
      const sgId = `grp_${g.replace(/[^A-Za-z0-9_]/g, '_')}`;
      out.push(`subgraph ${sgId}["${wrapNodeLabel(g, nodeWrap, maxLines)}"]`);
      for (const id of ids) out.push(`  ${id}`);
      out.push('end');
    }
  }

  // edges
  for (const e of ir.edges) {
    const lab = e.label ? `|${wrapEdgeLabel(e.label, edgeWrap)}|` : '';
    out.push(`${e.from} -->${lab} ${e.to}`);
  }

  return out.join('\n');
}

export function compileToMermaid(ir: DiagramIR): string {
  if (ir.kind === 'flowchart') return compileFlowchart(ir);
  throw new Error(`Unsupported kind: ${(ir as any).kind}`);
}
