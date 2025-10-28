import type { DiagramIR, FlowchartIR, NodeIR } from '@/lib/mermaid/schema';
import { sanitizeLabelText, pickSafeShape } from '@/lib/mermaid/sanitize';

const EDGE_LABEL_WHITESPACE = /\s+/g;

function sanitizeSegments(node: NodeIR): string[] {
  const raws = node.labelLines && node.labelLines.length ? node.labelLines : [node.label ?? ''];
  const segments = raws
    .map((seg) => sanitizeLabelText(seg))
    .filter((seg) => seg.length > 0);
  if (!segments.length) {
    segments.push(sanitizeLabelText(node.label ?? node.id) || node.id);
  }
  return segments.slice(0, 6);
}

function nodeShape(node: NodeIR, segments: string[]): 'rect' | 'decision' | 'terminator' {
  const preferred = node.shape === 'decision' || node.shape === 'terminator' ? node.shape : 'rect';
  return pickSafeShape(preferred, segments);
}

function renderNode(node: NodeIR): string {
  const segments = sanitizeSegments(node);
  const shape = nodeShape(node, segments);
  const label = segments.join('<br/>');
  if (shape === 'decision') return `${node.id}{"${label}"}`;
  if (shape === 'terminator') return `${node.id}("${label}")`;
  return `${node.id}["${label}"]`;
}

function renderSubgraphs(ir: FlowchartIR, lines: string[]) {
  if (!ir.subgraphs?.length) return;
  const altDirection = ir.direction === 'TB' || ir.direction === 'BT' ? 'LR' : 'TB';
  for (const sg of ir.subgraphs) {
    const title = sanitizeLabelText(sg.title, { banBrackets: true, banHtml: true, banQuotes: true });
    const safeTitle = title || 'Group';
    lines.push(`subgraph "${safeTitle}"`);
    if (sg.nodeIds.length > 1) {
      lines.push(`  direction ${altDirection}`);
    }
    for (const id of sg.nodeIds) {
      lines.push(`  ${id}`);
    }
    lines.push('end');
  }
}

function sanitizeEdgeLabel(label?: string): string | undefined {
  if (!label) return undefined;
  const cleaned = sanitizeLabelText(label).replace(EDGE_LABEL_WHITESPACE, ' ').slice(0, 30);
  return cleaned.length ? cleaned : undefined;
}

function renderEdges(ir: FlowchartIR, lines: string[]) {
  for (const edge of ir.edges) {
    const label = sanitizeEdgeLabel(edge.label ?? edge.kind);
    if (label) {
      lines.push(`${edge.from} -- ${label} --> ${edge.to}`);
    } else {
      lines.push(`${edge.from} --> ${edge.to}`);
    }
  }
}

function compileFlowchart(ir: FlowchartIR): string {
  const lines: string[] = [`flowchart ${ir.direction}`];
  for (const node of ir.nodes) {
    lines.push(renderNode(node));
  }
  renderSubgraphs(ir, lines);
  renderEdges(ir, lines);
  return lines.join('\n');
}

export function compileToMermaid(ir: DiagramIR): string {
  if (ir.kind === 'flowchart') {
    return compileFlowchart(ir);
  }
  throw new Error(`Unsupported kind: ${(ir as any).kind}`);
}
