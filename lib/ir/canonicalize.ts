import { IR } from './schema';

const RESERVED = new Set([
  'end','subgraph','graph','classDef','style','linkStyle','click',
  'accTitle','accDescr','flowchart','sequenceDiagram','classDiagram',
  'erDiagram','stateDiagram','mindmap'
]);

export function sanitizeId(raw: string): string {
  const s = raw.replace(/[^A-Za-z0-9_]/g, '_');
  const t = /^[A-Za-z_]/.test(s) ? s : `n_${s}`;
  const u = t.replace(/^_+/, 'n_');
  return RESERVED.has(u.toLowerCase()) ? `n_${u}` : u;
}

const ASCII_VISIBLE = /[^\x20-\x7E]/g;

function sanitizeSegment(raw: string, max = 60): string {
  const ascii = raw.replace(/\r\n?/g, ' ').replace(ASCII_VISIBLE, '');
  const cleaned = ascii.replace(/["'<>{}\[\]\(\)]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned.slice(0, max);
}

export function canonicalizeIR(ir: IR): IR {
  // rewrite IDs and map references
  const map = new Map<string,string>();
  for (const n of ir.nodes) {
    const newId = sanitizeId(n.id);
    map.set(n.id, newId); n.id = newId;
    if (!n.shape || (n.shape !== 'rect' && n.shape !== 'decision' && n.shape !== 'terminator')) {
      n.shape = 'rect';
    }
    const segmentsSource = n.labelLines && n.labelLines.length > 0 ? n.labelLines : [n.label ?? ''];
    const segments = segmentsSource
      .map((seg) => sanitizeSegment(seg))
      .filter((seg) => seg.length > 0);
    if (!segments.length) segments.push(newId);
    while (segments.length > 4) segments.pop();
    if (segments.length > 1 || (n.labelLines && n.labelLines.length)) {
      n.labelLines = [...segments];
    } else {
      delete n.labelLines;
    }
    n.label = segments[0].slice(0, 60);
    if (n.label.length === 0) n.label = newId;
    if (n.group) {
      const sanitizedGroup = sanitizeSegment(n.group, 60);
      if (sanitizedGroup) n.group = sanitizedGroup;
      else delete n.group;
    }
    if (n.bridge) {
      n.bridge = {
        toDiagram: Math.max(0, Number.isFinite(n.bridge.toDiagram) ? Math.floor(n.bridge.toDiagram) : 0),
        targetLabel: sanitizeSegment(n.bridge.targetLabel ?? '', 60) || n.label
      };
    }
  }
  ir.edges = ir.edges
    .map(e => ({...e, from: map.get(e.from) ?? e.from, to: map.get(e.to) ?? e.to}))
    .filter(e => e.from && e.to);
  // dedupe nodes (prefer higher weight)
  const dedup = new Map<string, typeof ir.nodes[number]>();
  for (const node of ir.nodes) {
    const existing = dedup.get(node.id);
    if (!existing || (node.weight ?? 0) > (existing.weight ?? 0)) {
      dedup.set(node.id, node);
    }
  }
  ir.nodes = Array.from(dedup.values())
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0) || a.id.localeCompare(b.id));
  const allowed = new Set(ir.nodes.map((n) => n.id));
  const seen = new Set<string>();
  ir.edges = ir.edges
    .filter((e) => allowed.has(e.from) && allowed.has(e.to))
    .map((e) => {
      if (e.label) {
        const sanitized = sanitizeSegment(e.label, 30);
        if (sanitized) e.label = sanitized;
        else delete e.label;
      }
      return e;
    })
    .filter((e) => {
      const key = `${e.from}->${e.to}#${e.label ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  // subgraphs sanity
  if (ir.subgraphs) {
    ir.subgraphs = ir.subgraphs.map(sg => ({
      title: sanitizeSegment(sg.title, 60),
      nodeIds: sg.nodeIds.filter(id => ir.nodes.some(n => n.id === id))
    })).filter(sg => sg.nodeIds.length >= 2);
  }
  return ir;
}
