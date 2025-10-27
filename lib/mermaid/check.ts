// Static checks for Mermaid source prior to parsing.

export type StaticIssue = {
  code: 'MISSING_HEADER' | 'UNCLOSED_SUBGRAPH' | 'UNBALANCED_QUOTES' | 'INVALID_EDGE_SYNTAX' | 'RESERVED_KEYWORD' | 'UNICODE_PUNCT' | 'TOO_LONG_LABEL' | 'BACKSLASH_QUOTE';
  message: string;
  severity: 'low' | 'medium' | 'high';
  line?: number;
};

export type StaticCheckResult = { ok: boolean; issues: StaticIssue[] };

// Returns true if a double quote is escaped by a backslash
function isEscaped(text: string, index: number) {
  let backslashes = 0;
  let i = index - 1;
  while (i >= 0 && text[i] === '\\') {
    backslashes += 1;
    i -= 1;
  }
  return backslashes % 2 === 1;
}

export function checkBalancedQuotes(source: string): { ok: boolean; issues: Array<{ line: number; text: string; quoteCount: number }> } {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const issues: Array<{ line: number; text: string; quoteCount: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    // Skip comments and obvious header lines
    if (line.startsWith('%%')) continue;
    if (/^(flowchart|graph|sequenceDiagram|classDiagram|erDiagram|stateDiagram|mindmap)\b/.test(line)) continue;

    let quotes = 0;
    for (let j = 0; j < raw.length; j++) {
      if (raw[j] === '"' && !isEscaped(raw, j)) quotes += 1;
    }
    if (quotes % 2 !== 0) {
      issues.push({ line: i + 1, text: raw, quoteCount: quotes });
    }
  }
  return { ok: issues.length === 0, issues };
}

const HEADER_RE = /^(flowchart|graph|sequenceDiagram|classDiagram|erDiagram|stateDiagram|mindmap)\b/;

export function checkStaticMermaid(source: string, type: 'flowchart' | 'sequence' | 'class' | 'er' | 'state' | 'mindmap'): StaticCheckResult {
  const issues: StaticIssue[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');

  // 1) Header on first non-empty/non-comment line
  const first = lines.find((l) => l.trim() && !l.trim().startsWith('%%'))?.trim() || '';
  if (!HEADER_RE.test(first)) {
    issues.push({ code: 'MISSING_HEADER', message: 'First non-comment line must be the diagram header', severity: 'high', line: 1 });
  }

  // 2) Unbalanced quotes per line
  const qc = checkBalancedQuotes(source);
  for (const q of qc.issues) {
    issues.push({ code: 'UNBALANCED_QUOTES', message: 'Odd number of unescaped double quotes on line', severity: 'high', line: q.line });
  }

  // 3) Unclosed subgraphs (simple counter)
  const stack: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('%%')) continue;
    if (/^subgraph\b/.test(t)) stack.push(i + 1);
    else if (/^end\b/.test(t)) stack.pop();
  }
  if (stack.length > 0) {
    issues.push({ code: 'UNCLOSED_SUBGRAPH', message: `Unclosed subgraph starting at line ${stack[0]}`, severity: 'high', line: stack[0] });
  }

  // 4) Invalid edge tokens: detect single-dash arrow A -> B (without --, -.-, ==>), or Unicode dashes
  const invalidEdgeRe = /(^|\s)[A-Za-z][A-Za-z0-9_]*\s*->\s*[A-Za-z][A-Za-z0-9_]*/;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (t.startsWith('%%')) continue;
    if (HEADER_RE.test(t)) continue;
    if (/[\u2013\u2014]/.test(raw)) {
      issues.push({ code: 'UNICODE_PUNCT', message: 'Unicode dash detected; use ASCII hyphen', severity: 'medium', line: i + 1 });
    }
    if (invalidEdgeRe.test(raw) && !/-->|-\.->|==>/.test(raw)) {
      issues.push({ code: 'INVALID_EDGE_SYNTAX', message: 'Use A --> B, -.->, or ==> (not A -> B)', severity: 'high', line: i + 1 });
    }
  }

  // 5) Reserved keyword as node id
  const reserved = new Set(['end', 'subgraph', 'classDef', 'style', 'linkStyle', 'click', 'accTitle', 'accDescr', 'flowchart', 'graph', 'sequenceDiagram', 'classDiagram', 'erDiagram', 'stateDiagram', 'mindmap']);
  const nodeDecl = /(^|\s)([A-Za-z][A-Za-z0-9_]*)\s*\[/;
  for (let i = 0; i < lines.length; i++) {
    const m = nodeDecl.exec(lines[i]);
    if (m) {
      const id = m[2];
      if (reserved.has(id)) {
        issues.push({ code: 'RESERVED_KEYWORD', message: `Reserved keyword used as node id: ${id}`, severity: 'medium', line: i + 1 });
      }
    }
  }

  // 6) Labels too long inside brackets
  const labelRe = /\[(.*?)\]/g;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    let m: RegExpExecArray | null;
    labelRe.lastIndex = 0;
    while ((m = labelRe.exec(raw))) {
      const label = m[1] || '';
      if (label.length > 100) {
        issues.push({ code: 'TOO_LONG_LABEL', message: 'Label too long (>100 chars); shorten', severity: 'low', line: i + 1 });
      }
      if (/[“”‘’…•]/.test(label)) {
        issues.push({ code: 'UNICODE_PUNCT', message: 'Unicode punctuation in label; use ASCII', severity: 'medium', line: i + 1 });
      }
      if (/\\"/.test(label)) {
        issues.push({ code: 'BACKSLASH_QUOTE', message: 'Avoid backslash-escaped quotes (\\"); prefer apostrophes or plain text', severity: 'medium', line: i + 1 });
      }
    }
  }

  return { ok: issues.filter((x) => x.severity !== 'low').length === 0, issues };
}
