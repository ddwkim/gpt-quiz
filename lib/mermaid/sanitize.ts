const unicodeReplacements: Array<[RegExp, string]> = [
  [/[“”«»„‟]/g, '"'],
  [/['‘’‚‛]/g, "'"],
  [/[\u2013\u2014]/g, '-'],
  [/…/g, '...'],
  [/•/g, '-'],
  [/[\u2022]/g, '-']
];

export function normalizeUnicode(input: string): string {
  return unicodeReplacements.reduce((acc, [re, replacement]) => acc.replace(re, replacement), input);
}

export function canonicalizeNodeIds(src: string): string {
  const labelToId = new Map<string, string>();
  let counter = 1;

  const assignId = (label: string) => {
    const trimmed = label.trim();
    if (labelToId.has(trimmed)) return labelToId.get(trimmed)!;
    const id = `n${counter.toString(36)}`;
    counter += 1;
    labelToId.set(trimmed, id);
    return id;
  };

  const shouldSkipLine = (line: string) => {
    const trimmed = line.trimStart();
    return (
      trimmed.startsWith('%%') ||
      trimmed.startsWith('subgraph') ||
      trimmed.startsWith('end') ||
      trimmed.startsWith('classDef') ||
      trimmed.startsWith('style') ||
      trimmed.startsWith('linkStyle') ||
      // Diagram/type directives
      /^flowchart\s/i.test(trimmed) ||
      /^graph\s/i.test(trimmed) ||
      /^sequenceDiagram\b/i.test(trimmed) ||
      /^classDiagram\b/i.test(trimmed) ||
      /^stateDiagram\b/i.test(trimmed) ||
      /^erDiagram\b/i.test(trimmed) ||
      /^mindmap\b/i.test(trimmed)
    );
  };

  const tokenPattern =
    /(^|[\s,(])([A-Za-z][A-Za-z0-9 _-]*\s+[A-Za-z0-9 _-]+)(?=\s*(?:-->|---|===|::|:::|-\.->|-\.-|==>|$))/g;

  return src
    .split('\n')
    .map((line) => {
      if (shouldSkipLine(line)) return line;

      // Only attempt canonicalization on lines that actually express edges or styles
      if (!/(-->|---|===|-\.->|==>|:::|::)/.test(line)) {
        return line;
      }

      // Do not change lines that already include labeled edges (Mermaid syntax like: A -- text --> B)
      if (/--\s+[^-].*-->/.test(line)) {
        return line;
      }

      return line.replace(tokenPattern, (match, prefix, label) => {
        if (/\[[^\]]*\]/.test(label) || /["']/.test(label)) {
          return match;
        }
        // Avoid internal double quotes in labels; prefer apostrophes
        const safeLabel = label.trim().replace(/"/g, "'");
        const nodeId = assignId(label);
        return `${prefix}${nodeId}["${safeLabel}"]`;
      });
    })
    .join('\n');
}

function getMaxLabel(): number {
  const env = (process.env.NEXT_PUBLIC_MERMAID_SANITIZE_MAX_LABEL ?? process.env.MERMAID_SANITIZE_MAX_LABEL ?? '120');
  const n = Number(env);
  return Number.isFinite(n) ? n : 120;
}

export function trimLongLabels(src: string, max = getMaxLabel()): string {
  return src.replace(/\[(.*?)\]/g, (_m, text) => {
    let t = String(text);
    if (t.length <= max) return `[${t}]`;

    // If label is quoted, trim inside balanced quotes and preserve them
    const startsQ = t.startsWith('"');
    const endsQ = t.endsWith('"');
    if (startsQ && endsQ && t.length >= 2) {
      const inner = t.slice(1, -1);
      if (inner.length <= max - 2) return `[${t}]`;
      const trimmed = inner.slice(0, Math.max(0, max - 2 - 3)) + '...';
      return `["${trimmed}"]`;
    }

    // Otherwise trim raw content
    return `[${t.slice(0, Math.max(0, max - 3))}...]`;
  });
}

export function basicSanitize(src: string): string {
  let s = normalizeUnicode(src);
  s = canonicalizeNodeIds(s);
  s = fixUnbalancedLabelQuotes(s);
  s = quoteBracketLabels(s);
  s = trimLongLabels(s);
  return s;
}

// Fix labels like ["foo ...] or labels containing odd, unescaped quotes by normalizing
// to a safe quoted label. This runs before quoteBracketLabels so that the wrapper
// can be applied consistently afterward.
function fixUnbalancedLabelQuotes(src: string): string {
  return src.replace(/(\b[A-Za-z][A-Za-z0-9_-]*)\[((?:\\.|[^\]])*?)\]/g, (m, id, label) => {
    const raw = String(label);
    // Pre-trim escaped quote artifacts at edges: \"...
    let text = raw;
    if (text.startsWith('\\"')) text = text.slice(2);
    if (text.endsWith('\\"')) text = text.slice(0, -2);

    // Count unescaped quotes
    let count = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '"') {
        let bs = 0, j = i - 1;
        while (j >= 0 && text[j] === '\\') { bs++; j--; }
        if (bs % 2 === 0) count++;
      }
    }
    if (count % 2 === 0 && !/^\s*"/.test(text)) {
      // Looks balanced and not starting with an unescaped quote -> leave quoting to next pass
      return m;
    }
    // Sanitize: strip unmatched leading/trailing quotes and normalize inner quotes
    text = text.trim();
    if (text.startsWith('"') && !text.endsWith('"')) text = text.slice(1);
    if (!text.startsWith('"') && text.endsWith('"')) text = text.slice(0, -1);
    // Replace any remaining escaped quotes and double quotes with apostrophes to avoid Mermaid parse issues
    const safe = text.replace(/\\"/g, "'").replace(/"/g, "'");
    return `${id}["${safe}"]`;
  });
}

// Ensure labels inside square-bracket node declarations are quoted, so punctuation like
// parentheses doesn't confuse the parser: A[foo (bar)] -> A["foo (bar)"]
function quoteBracketLabels(src: string): string {
  const shouldSkipLine = (line: string) => {
    const t = line.trimStart();
    return (
      t.startsWith('%%') ||
      t.startsWith('subgraph') ||
      t.startsWith('end') ||
      t.startsWith('classDef') ||
      t.startsWith('style') ||
      t.startsWith('linkStyle')
    );
  };

  return src
    .split('\n')
    .map((line) => {
      if (shouldSkipLine(line)) return line;
      return line.replace(/(\b[A-Za-z][A-Za-z0-9_-]*)\[((?:\\.|[^\]])*?)\]/g, (m, id, label) => {
        const trimmed = String(label).trim();
        if (/^".*"$/.test(trimmed)) return m; // already quoted
        // Avoid internal double quotes in labels; prefer apostrophes
        const safe = trimmed.replace(/\\"/g, "'").replace(/"/g, "'");
        return `${id}["${safe}"]`;
      });
    })
    .join('\n');
}
