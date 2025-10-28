import { canonicalizeIR, sanitizeId } from '@/lib/ir/canonicalize';
import type { IR } from '@/lib/ir/schema';
import { pickSafeShape, sanitizeLabelText } from '@/lib/mermaid/sanitize';

function cloneIR<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export function fixByToken(ir: IR): IR {
  const next = cloneIR(ir);
  const idMap = new Map<string, string>();
  for (const node of next.nodes) {
    const safe = sanitizeId(node.id);
    idMap.set(node.id, safe);
    node.id = safe;
  }
  next.edges = next.edges.map((edge) => ({
    ...edge,
    from: idMap.get(edge.from) ?? sanitizeId(edge.from),
    to: idMap.get(edge.to) ?? sanitizeId(edge.to)
  }));
  if (next.subgraphs) {
    next.subgraphs = next.subgraphs.map((sg) => ({
      title: sg.title,
      nodeIds: sg.nodeIds.map((id) => idMap.get(id) ?? sanitizeId(id))
    }));
  }
  return canonicalizeIR(next);
}

export function fixByArity(ir: IR): IR {
  const next = cloneIR(ir);
  const nodeIds = new Set(next.nodes.map((node) => node.id));
  const orphanEdges: typeof next.edges = [];
  next.edges = next.edges.filter((edge) => {
    const keep = nodeIds.has(edge.from) && nodeIds.has(edge.to);
    if (!keep) orphanEdges.push(edge);
    return keep;
  });
  for (const edge of orphanEdges) {
    if (!nodeIds.has(edge.from)) {
      nodeIds.add(edge.from);
      next.nodes.push({
        id: edge.from,
        label: edge.from,
        weight: 0
      });
    }
    if (!nodeIds.has(edge.to)) {
      nodeIds.add(edge.to);
      next.nodes.push({
        id: edge.to,
        label: edge.to,
        weight: 0
      });
    }
    next.edges.push(edge);
  }
  if (next.subgraphs) {
    next.subgraphs = next.subgraphs.map((sg) => ({
      title: sg.title,
      nodeIds: sg.nodeIds.filter((id) => nodeIds.has(id))
    })).filter((sg) => sg.nodeIds.length >= 2);
  }
  return canonicalizeIR(next);
}

export function fixByBlock(ir: IR): IR {
  if (!ir.subgraphs?.length) return ir;
  const next = cloneIR(ir);
  next.subgraphs = [...next.subgraphs];
  next.subgraphs.sort((a, b) => a.nodeIds.length - b.nodeIds.length || a.title.localeCompare(b.title));
  next.subgraphs.shift();
  return canonicalizeIR(next);
}

export function fixTokenIssues(ir: IR): IR {
  const next = cloneIR(ir);
  for (const node of next.nodes) {
    const rawSegments = node.labelLines && node.labelLines.length ? node.labelLines : [node.label ?? ''];
    const sanitized = rawSegments
      .map((seg) => sanitizeLabelText(seg))
      .map((seg) => seg.slice(0, 60))
      .filter((seg) => seg.length > 0);
    if (!sanitized.length) {
      const fallback = sanitizeLabelText(node.label ?? node.id) || node.id;
      sanitized.push(fallback.slice(0, 60));
    }
    if (sanitized.length > 1 || (node.labelLines && node.labelLines.length)) {
      node.labelLines = sanitized.slice(0, 6);
    } else {
      delete node.labelLines;
    }
    node.label = sanitized[0];
    node.shape = pickSafeShape(node.shape, sanitized);
    if (node.group) {
      const sanitizedGroup = sanitizeLabelText(node.group, { banBrackets: true, banHtml: true, banQuotes: true }).slice(0, 60);
      if (sanitizedGroup) node.group = sanitizedGroup;
      else delete node.group;
    }
  }
  for (const edge of next.edges) {
    if (edge.label) {
      const sanitized = sanitizeLabelText(edge.label).slice(0, 30);
      if (sanitized) edge.label = sanitized;
      else delete edge.label;
    }
  }
  if (next.subgraphs) {
    next.subgraphs = next.subgraphs.map((sg) => ({
      title: sanitizeLabelText(sg.title).slice(0, 60),
      nodeIds: sg.nodeIds
    }));
  }
  return canonicalizeIR(next);
}
