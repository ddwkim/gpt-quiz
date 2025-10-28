const HEADER_RE = /^(flowchart|graph|sequenceDiagram|classDiagram|erDiagram|stateDiagram|mindmap)\b/i;
const RESERVED = new Set([
  'end',
  'subgraph',
  'graph',
  'classdef',
  'style',
  'linkstyle',
  'click',
  'acctitle',
  'accdescr',
  'flowchart',
  'sequencediagram',
  'classdiagram',
  'erdiagram',
  'statediagram',
  'mindmap'
]);

export type StaticIssueCode =
  | 'HEADER/MISSING'
  | 'TOKEN/RESERVED'
  | 'TOKEN/LEADING_DIGIT'
  | 'TOKEN/DUPLICATE_ID'
  | 'TOKEN/UNSUPPORTED_CHAR'
  | 'TOKEN/CLOSER_IN_LABEL'
  | 'TOKEN/HTML_IN_LABEL'
  | 'TOKEN/QUOTE_NOISE'
  | 'BLOCK/UNBALANCED'
  | 'BLOCK/SUBGRAPH_TITLE'
  | 'ARITY/ORPHAN_EDGE'
  | 'SIZE/DEGREE_CAP'
  | 'LABEL/EDGE_QUOTE'
  | 'LABEL/NON_ASCII';

export type StaticIssue = {
  code: StaticIssueCode;
  message: string;
  severity: 'low' | 'medium' | 'high';
  line?: number;
  meta?: Record<string, unknown>;
};

export type StaticCheckResult = { ok: boolean; issues: StaticIssue[] };

const EDGE_RE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*--\s*(?:([A-Za-z_][A-Za-z0-9_]*)\s+)?-->\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/;
const NODE_RE = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*[\[\(\{><]/;
const SUBGRAPH_RE = /^\s*subgraph\s+(.+?)\s*$/i;
const END_RE = /^\s*end\s*$/i;

function asciiOnly(text: string): boolean {
  return /^[\x00-\x7F]*$/.test(text);
}

export function checkStaticMermaid(source: string, type: 'flowchart' | 'sequence' | 'class' | 'er' | 'state' | 'mindmap'): StaticCheckResult {
  void type;
  const issues: StaticIssue[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let headerSeen = false;
  const nodeIds = new Map<string, number>();
  const degree = new Map<string, number>();
  const edges: Array<{ from: string; to: string; label?: string; line: number }> = [];
  const stack: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const text = raw.trim();
    if (!text) continue;
    if (text.startsWith('%%')) continue;

    if (!headerSeen && HEADER_RE.test(text)) {
      headerSeen = true;
      continue;
    }

    const subgraphMatch = SUBGRAPH_RE.exec(text);
    if (subgraphMatch) {
      const titleRaw = subgraphMatch[1].replace(/^\w+\s*/, '');
      const title = titleRaw.replace(/\[[^\]]*\]$/, '').replace(/^"|"$/g, '');
      if (!asciiOnly(title) || title.includes(':') || title.includes('"')) {
        issues.push({
          code: 'BLOCK/SUBGRAPH_TITLE',
          message: 'Subgraph titles must be ASCII without quotes or colons',
          severity: 'medium',
          line: i + 1
        });
      }
      stack.push(i + 1);
      continue;
    }

    if (END_RE.test(text)) {
      stack.pop();
      continue;
    }

    const edgeMatch = EDGE_RE.exec(text);
    if (edgeMatch) {
      const [, from, label, to] = edgeMatch;
      edges.push({ from, to, label: label?.trim() || undefined, line: i + 1 });
      degree.set(from, (degree.get(from) ?? 0) + 1);
      degree.set(to, (degree.get(to) ?? 0) + 1);
      if (label && /['"]/.test(label)) {
        issues.push({
          code: 'LABEL/EDGE_QUOTE',
          message: 'Edge labels must not contain quotes',
          severity: 'medium',
          line: i + 1
        });
      }
      if (label && !asciiOnly(label)) {
        issues.push({
          code: 'LABEL/NON_ASCII',
          message: 'Edge labels must be ASCII',
          severity: 'medium',
          line: i + 1
        });
      }
      continue;
    }

    const nodeMatch = NODE_RE.exec(text);
    if (nodeMatch) {
      const id = nodeMatch[1];
      if (/^[0-9]/.test(id)) {
        issues.push({
          code: 'TOKEN/LEADING_DIGIT',
          message: `Node id "${id}" starts with a digit`,
          severity: 'high',
          line: i + 1
        });
      }
      const lower = id.toLowerCase();
      if (RESERVED.has(lower)) {
        issues.push({
          code: 'TOKEN/RESERVED',
          message: `Reserved keyword cannot be used as id: ${id}`,
          severity: 'high',
          line: i + 1
        });
      }
      if (!asciiOnly(id)) {
        issues.push({
          code: 'TOKEN/UNSUPPORTED_CHAR',
          message: `Node id "${id}" must be ASCII`,
          severity: 'high',
          line: i + 1
        });
      }
      if (nodeIds.has(id)) {
        issues.push({
          code: 'TOKEN/DUPLICATE_ID',
          message: `Duplicate node id "${id}"`,
          severity: 'high',
          line: i + 1
        });
      } else {
        nodeIds.set(id, i + 1);
      }

      const rawLabel = (() => {
        const rectIdx = raw.indexOf('["');
        if (rectIdx >= 0) {
          const end = raw.indexOf('"]', rectIdx + 2);
          if (end > rectIdx) return raw.slice(rectIdx + 2, end);
        }
        const decIdx = raw.indexOf('{"');
        if (decIdx >= 0) {
          const end = raw.indexOf('"}', decIdx + 2);
          if (end > decIdx) return raw.slice(decIdx + 2, end);
        }
        const termIdx = raw.indexOf('("');
        if (termIdx >= 0) {
          const end = raw.indexOf('")', termIdx + 2);
          if (end > termIdx) return raw.slice(termIdx + 2, end);
        }
        return undefined;
      })();

      if (rawLabel !== undefined) {
        const labelNoBr = rawLabel.replace(/<br\/>/gi, '');
        if (/[\]\}\)]/.test(labelNoBr)) {
          issues.push({
            code: 'TOKEN/CLOSER_IN_LABEL',
            message: `Label for "${id}" contains a closing bracket character`,
            severity: 'high',
            line: i + 1
          });
        }
        if (/[<>\u003C\u003E]/.test(labelNoBr)) {
          issues.push({
            code: 'TOKEN/HTML_IN_LABEL',
            message: `Label for "${id}" contains HTML-like tokens`,
            severity: 'high',
            line: i + 1
          });
        }
        if (/['"]/.test(labelNoBr)) {
          issues.push({
            code: 'TOKEN/QUOTE_NOISE',
            message: `Label for "${id}" contains quotes`,
            severity: 'medium',
            line: i + 1
          });
        }
      }
      continue;
    }
  }

  if (!headerSeen) {
    issues.push({
      code: 'HEADER/MISSING',
      message: 'First non-comment line must be the diagram header',
      severity: 'high',
      line: 1
    });
  }

  if (stack.length > 0) {
    issues.push({
      code: 'BLOCK/UNBALANCED',
      message: `Unclosed subgraph starting at line ${stack[0]}`,
      severity: 'high',
      line: stack[0]
    });
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      issues.push({
        code: 'ARITY/ORPHAN_EDGE',
        message: `Edge references missing node: ${edge.from} --> ${edge.to}`,
        severity: 'high',
        line: edge.line
      });
    }
  }

  for (const [id, deg] of degree.entries()) {
    if (deg > 12) {
      issues.push({
        code: 'SIZE/DEGREE_CAP',
        message: `Node "${id}" exceeds degree cap (degree=${deg})`,
        severity: 'medium',
        line: nodeIds.get(id)
      });
    }
  }

  const ok = !issues.some((issue) => issue.severity === 'high');
  return { ok, issues };
}
