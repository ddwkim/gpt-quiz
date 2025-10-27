import type { Conversation, Msg } from '@/lib/types';
import { jsonrepair } from 'jsonrepair';

const ALLOWED = (process.env.ALLOWED_SHARE_HOSTS ?? 'chatgpt.com')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const MAX_INPUT = Number(process.env.MAX_INPUT_CHARS ?? '60000');
const EXTRACT_CACHE_TTL_MS = Number(process.env.EXTRACT_CACHE_TTL_MS ?? '300000'); // 5 minutes default
const EXTRACT_CACHE_MAX = Number(process.env.EXTRACT_CACHE_MAX ?? '100');

type CacheEntry = { ts: number; value: Conversation };
const extractCache = new Map<string, CacheEntry>();

function cacheGet(key: string): Conversation | null {
  const e = extractCache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > EXTRACT_CACHE_TTL_MS) {
    extractCache.delete(key);
    return null;
  }
  return e.value;
}

function cacheSet(key: string, value: Conversation) {
  extractCache.set(key, { ts: Date.now(), value });
  // simple cull: remove oldest insertions if over max
  if (extractCache.size > EXTRACT_CACHE_MAX) {
    const over = extractCache.size - EXTRACT_CACHE_MAX;
    let i = 0;
    for (const k of extractCache.keys()) {
      extractCache.delete(k);
      i += 1;
      if (i >= over) break;
    }
  }
}

function hostAllowed(url: URL) {
  return ALLOWED.includes(url.host);
}

function uuidFromSharePath(pathname: string) {
  const m = pathname.match(/\/share\/([a-f0-9-]{16,})/i);
  return m?.[1] ?? null;
}

export async function extractFromShare(shareUrl: string): Promise<Conversation> {
  if (!process.env.OPENAI_API_KEY) {
    // extraction does not require API key but downstream will; provide early hint
  }

  let parsed: URL;
  try {
    parsed = new URL(shareUrl);
  } catch (err) {
    throw new Error('Bad URL');
  }

  if (!hostAllowed(parsed)) {
    throw new Error('Host not allowed');
  }

  const uuid = uuidFromSharePath(parsed.pathname);
  if (!uuid) {
    throw new Error('No share UUID found');
  }

  // Cache key normalized by origin + canonical share path
  const cacheKey = `${parsed.origin}/share/${uuid}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const ua =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118 Safari/537.36';

  const html = await fetch(parsed.toString(), {
    headers: {
      'user-agent': ua,
      accept: 'text/html,application/xhtml+xml'
    }
  }).then((r) => {
    if (!r.ok) {
      throw new Error(`GET share failed ${r.status}`);
    }
    return r.text();
  });

  const inline = extractNextDataJSON(html);
  let conversation = inline ? pluckConversation(inline) : null;

  if (!conversation) {
    conversation = parseReactRouterConversation(html);
  }

  if (!conversation) {
    const buildId = inline?.buildId ?? extractBuildId(html);
    if (buildId) {
      const candidates = [
        `/_next/data/${buildId}/share/${uuid}.json`,
        `/_next/data/${buildId}/en/share/${uuid}.json`,
        `/_next/data/${buildId}/en-US/share/${uuid}.json`,
        `/_next/data/${buildId}/share.json?shareId=${uuid}`,
        `/_next/data/${buildId}/en/share.json?shareId=${uuid}`
      ];
      for (const path of candidates) {
        try {
          const jsonUrl = new URL(path, parsed.origin);
          const data = await fetch(jsonUrl, {
            headers: {
              'user-agent': ua,
              accept: 'application/json'
            }
          }).then((r) => {
            if (!r.ok) {
              throw new Error(`GET json failed ${r.status}`);
            }
            return r.json();
          });
          conversation = pluckConversation(data);
          if (conversation) break;
        } catch {
          // try next candidate
        }
      }
    }
  }

  if (!conversation) {
    // Final fallback: use a readability proxy (r.jina.ai) to extract visible text
    const readable = await readableFallback(parsed.toString()).catch(() => null);
    if (readable && readable.trim().length > 0) {
      const text = postprocessReadable(readable).trim();
      if (text) {
        const conv = conversationFromPlaintext(textToPseudoTranscript(text));
        if (conv.messages.length) {
          conversation = { title: extractTitleFromHtml(html) ?? undefined, messages: conv.messages };
        }
      }
    }

    if (!conversation) {
      throw new Error('Could not locate transcript in shared page');
    }
  }

  const messages = conversation.messages
    .map(strip)
    .filter((m) => m.content.trim().length > 0);

  const totalLen = messages.reduce((sum, m) => sum + m.content.length, 0);
  if (totalLen > MAX_INPUT) {
    throw new Error(`Transcript too large (${totalLen} chars > ${MAX_INPUT}). Reduce or split.`);
  }

  const conv: Conversation = { title: conversation.title, messages };
  cacheSet(cacheKey, conv);
  return conv;
}

export function conversationFromPlaintext(input: string): Conversation {
  const lines = input
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l, idx, arr) => !(l === '' && arr[idx - 1] === ''));

  const messages: Msg[] = [];
  let current: Msg | null = null;

  const flush = () => {
    if (current) {
      current.content = current.content.trim();
      if (current.content.length > 0) {
        messages.push(current);
      }
      current = null;
    }
  };

  for (const line of lines) {
    const roleMatch = line.match(/^(user|assistant)\s*[:|-]\s*/i);
    if (roleMatch) {
      flush();
      const role = roleMatch[1].toLowerCase() === 'user' ? 'user' : 'assistant';
      current = { role, content: line.slice(roleMatch[0].length).trim() };
      continue;
    }

    if (!current) {
      current = { role: messages.length % 2 === 0 ? 'user' : 'assistant', content: line };
    } else {
      current.content += `\n${line}`;
    }
  }

  flush();

  const totalLen = messages.reduce((sum, m) => sum + m.content.length, 0);
  if (totalLen > MAX_INPUT) {
    throw new Error(`Transcript too large (${totalLen} chars > ${MAX_INPUT}). Reduce or split.`);
  }

  return { messages };
}

function extractNextDataJSON(html: string): any | null {
  const re = /<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i;
  const m = re.exec(html);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch (err) {
    return null;
  }
}

function extractBuildId(html: string): string | null {
  const match = html.match(/"buildId"\s*:\s*"([^"]+)"/);
  return match?.[1] ?? null;
}

function pluckConversation(obj: any): { title?: string; messages: Msg[] } | null {
  const seen = new Set<any>();
  let title: string | undefined;
  let best: Msg[] | null = null;

  function walk(node: any) {
    if (!node || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (typeof node.title === 'string' && !title) {
      title = node.title;
    }

    if (Array.isArray(node)) {
      if (node.length && looksLikeMsg(node[0])) {
        const msgs = node.map(asMsg).filter(Boolean) as Msg[];
        if (msgs.length) {
          best = msgs;
        }
      } else {
        node.forEach(walk);
      }
      return;
    }

    Object.values(node).forEach(walk);
  }

  walk(obj);
  if (!best) return null;

  const deduped = dedupeMessages(best);
  return { title, messages: deduped };
}

function looksLikeMsg(x: any): boolean {
  if (!x || typeof x !== 'object') return false;
  const hasRole = typeof x.role === 'string' || typeof x.author?.role === 'string';
  const hasContent = typeof x.content === 'string' || Array.isArray(x.content?.parts) || Array.isArray(x.content);
  return Boolean(hasRole && hasContent);
}

function asMsg(x: any): Msg | null {
  let role: 'user' | 'assistant' | null = null;
  if (typeof x.role === 'string') {
    role = x.role === 'user' ? 'user' : 'assistant';
  } else if (x.author && typeof x.author.role === 'string') {
    role = x.author.role === 'user' ? 'user' : 'assistant';
  }

  if (!role) return null;

  let text = '';
  if (typeof x.content === 'string') {
    text = x.content;
  } else if (x.content?.content_type === 'text' && typeof x.content?.parts?.[0] === 'string') {
    text = x.content.parts[0];
  } else if (Array.isArray(x.content?.parts)) {
    text = x.content.parts.filter((p: any) => typeof p === 'string').join('\n\n');
  } else if (Array.isArray(x.content)) {
    text = x.content
      .map((p: any) => {
        if (typeof p === 'string') return p;
        if (typeof p?.text === 'string') return p.text;
        if (typeof p?.value === 'string') return p.value;
        return '';
      })
      .filter(Boolean)
      .join('\n\n');
  }

  const ts = typeof x.create_time === 'number' ? x.create_time : typeof x.ts === 'number' ? x.ts : undefined;
  return { role, content: String(text ?? ''), ts };
}

function dedupeMessages(msgs: Msg[]): Msg[] {
  const out: Msg[] = [];
  const seen = new Set<string>();
  for (const msg of msgs) {
    const key = `${msg.role}:${msg.content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(msg);
  }
  return out;
}

function strip(m: Msg): Msg {
  return {
    ...m,
    content: m.content.replace(/\s+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
  };
}

function parseReactRouterConversation(html: string): Conversation | null {
  const match = html.match(/window\.__reactRouterContext\.streamController\.enqueue\("([\s\S]*?)"\)/);
  if (!match) return null;

  let decoded: string;
  try {
    let raw = match[1];
    const trailing = raw.match(/\\+$/);
    if (trailing && trailing[0].length % 2 === 1) {
      raw += '\\';
    }
    decoded = JSON.parse('"' + raw + '"');
  } catch {
    return null;
  }

  let data: any;
  const repaired = jsonrepair(decoded);
  const sanitized = repaired
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');

  try {
    data = JSON.parse(sanitized);
  } catch {
    try {
      // Fallback to runtime evaluation when JSON parsing fails (React Flight chunks sometimes include
      // characters that break strict JSON parsing but are valid JS string literals).
      // eslint-disable-next-line no-new-func
      data = Function(`return (${sanitized})`)();
    } catch {
      return null;
    }
  }

  if (!Array.isArray(data)) return null;

  const mappingTokenIdx = data.indexOf('mapping');
  const titleTokenIdx = data.indexOf('title');
  if (mappingTokenIdx === -1 || titleTokenIdx === -1) return null;

  const conversationIdx = data.findIndex((entry) => {
    if (!isPlainObject(entry)) return false;
    return entry.hasOwnProperty(`_${mappingTokenIdx}`) && entry.hasOwnProperty(`_${titleTokenIdx}`);
  });

  if (conversationIdx === -1) return null;

  const resolve = createFlightResolver(data);
  const payload = resolve(conversationIdx);
  if (!isPlainObject(payload)) return null;

  const mapping = isPlainObject(payload.mapping) ? (payload.mapping as Record<string, any>) : null;
  if (!mapping) return null;

  const title = typeof payload.title === 'string' ? payload.title : undefined;
  const rootId = 'client-created-root';
  const visited = new Set<string>();
  const messages: Msg[] = [];

  const walk = (id: string | undefined) => {
    if (!id || visited.has(id)) return;
    visited.add(id);
    const node = mapping[id];
    if (!isPlainObject(node)) return;

    const message = node.message;
    if (isPlainObject(message)) {
      const role = message?.author?.role;
      const metadata = message?.metadata ?? {};
      if ((role === 'user' || role === 'assistant') && !metadata?.is_visually_hidden_from_conversation) {
        const text = flightContentToText(message.content);
        if (text) {
          const ts = typeof message.create_time === 'number' ? message.create_time : undefined;
          messages.push({ role, content: text, ts });
        }
      }
    }

    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) {
      if (typeof child === 'string') {
        walk(child);
      }
    }
  };

  walk(rootId);

  if (!messages.length) return null;

  return { title, messages };
}

async function readableFallback(shareUrl: string): Promise<string> {
  const u = new URL(shareUrl);
  const proxied = `https://r.jina.ai/http://${u.host}${u.pathname}`;
  const res = await fetch(proxied, { headers: { accept: 'text/plain' } });
  if (!res.ok) throw new Error(`readable proxy failed ${res.status}`);
  return await res.text();
}

function postprocessReadable(raw: string): string {
  // Extract content after "Markdown Content:" if present
  const idx = raw.indexOf('Markdown Content:');
  const body = idx !== -1 ? raw.slice(idx + 'Markdown Content:'.length) : raw;
  return body.replace(/^\s+|\s+$/g, '');
}

function textToPseudoTranscript(text: string): string {
  // If the text already contains role markers, keep them; otherwise mark as assistant
  if (/^\s*(user|assistant)\s*[:|-]/im.test(text)) return text;
  return `assistant: ${text}`;
}

function extractTitleFromHtml(html: string): string | null {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  return m?.[1] ?? null;
}

function flightContentToText(content: any): string | null {
  if (!content || typeof content !== 'object') return null;
  const type = content.content_type;
  if (type === 'text' || type === 'multimodal_text') {
    const parts = Array.isArray(content.parts) ? content.parts : [];
    const text = parts
      .map((part: any) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && typeof part.text === 'string') return part.text;
        return '';
      })
      .filter(Boolean)
      .join('\n\n')
      .trim();
    return text || null;
  }
  if (type === 'code' && typeof content.text === 'string') {
    const text = content.text.trim();
    return text ? text : null;
  }
  return null;
}

function createFlightResolver(source: any[]) {
  const memo = new Map<number, any>();

  const resolve = (input: any): any => {
    if (typeof input === 'number') {
      if (input < 0 || input >= source.length) return null;
      if (memo.has(input)) return memo.get(input);
      const value = source[input];
      if (value === null || typeof value !== 'object') {
        memo.set(input, value);
        return value;
      }
      if (Array.isArray(value)) {
        const arr: any[] = [];
        memo.set(input, arr);
        for (const item of value) {
          arr.push(resolve(item));
        }
        return arr;
      }
      if (isPlainObject(value)) {
        const objValue: Record<string, any> = {};
        memo.set(input, objValue);
        for (const [rawKey, rawVal] of Object.entries(value)) {
          let key: any = rawKey;
          if (typeof rawKey === 'string' && rawKey.startsWith('_') && /^\d+$/.test(rawKey.slice(1))) {
            key = resolve(Number(rawKey.slice(1)));
          } else {
            key = resolve(rawKey);
          }
          if (key === null || key === undefined) continue;
          objValue[String(key)] = resolve(rawVal);
        }
        return objValue;
      }
      memo.set(input, value);
      return value;
    }

    if (Array.isArray(input)) {
      return input.map((item) => resolve(item));
    }

    if (isPlainObject(input)) {
      const result: Record<string, any> = {};
      for (const [rawKey, rawValue] of Object.entries(input)) {
        let key: any = rawKey;
        if (typeof rawKey === 'string' && rawKey.startsWith('_') && /^\d+$/.test(rawKey.slice(1))) {
          key = resolve(Number(rawKey.slice(1)));
        } else {
          key = resolve(rawKey);
        }
        if (key === null || key === undefined) continue;
        const resolvedValue = resolve(rawValue);
        result[String(key)] = resolvedValue;
      }
      return result;
    }

    return input;
  };

  return resolve;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
