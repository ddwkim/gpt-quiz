import { jsonrepair } from 'jsonrepair';

const url = process.argv[2];
if (!url) {
  console.error('usage: tsx scripts/debug_flight.ts <share-url>');
  process.exit(1);
}

async function main() {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118 Safari/537.36',
      accept: 'text/html'
    }
  });
  const html = await res.text();
  console.log('status', res.status, 'length', html.length);
  const conv = parseReactRouterConversation(html);
  if (!conv) {
    console.log('no conversation parsed');
    return;
  }
  console.log('title', conv.title);
  console.log('messages', conv.messages.length);
  console.log(conv.messages.slice(0, 3));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

function parseReactRouterConversation(html: string) {
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
    console.log('decoded prefix', decoded.slice(0, 80));
  } catch {
    console.log('failed in decoded JSON.parse');
    return null;
  }
  const sanitized = jsonrepair(decoded)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');

  let data: any;
  try {
    data = JSON.parse(sanitized);
  } catch (err) {
    console.log('failed to JSON.parse decoded', (err as Error).message.slice(0, 120));
    try {
      // eslint-disable-next-line no-new-func
      data = Function(`return (${sanitized})`)();
    } catch (err2) {
      console.log('eval fallback failed', (err2 as Error).message);
      return null;
    }
  }
  if (!Array.isArray(data)) return null;
  const mappingTokenIdx = data.indexOf('mapping');
  const titleTokenIdx = data.indexOf('title');
  if (mappingTokenIdx === -1 || titleTokenIdx === -1) {
    console.log('missing mapping/title tokens');
    return null;
  }
  const conversationIdx = data.findIndex((entry) => {
    if (!isPlainObject(entry)) return false;
    return entry.hasOwnProperty(`_${mappingTokenIdx}`) && entry.hasOwnProperty(`_${titleTokenIdx}`);
  });
  if (conversationIdx === -1) {
    console.log('no conversation index found');
    return null;
  }
  const resolve = createFlightResolver(data);
  const payload = resolve(conversationIdx);
  if (!isPlainObject(payload)) {
    console.log('payload not plain object');
    return null;
  }
  const mapping = isPlainObject(payload.mapping) ? payload.mapping as Record<string, any> : null;
  if (!mapping) {
    console.log('missing mapping object');
    return null;
  }
  const title = typeof payload.title === 'string' ? payload.title : undefined;
  const rootId = 'client-created-root';
  const visited = new Set<string>();
  const messages: any[] = [];
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
      if (typeof child === 'string') walk(child);
    }
  };
  walk(rootId);
  if (!messages.length) {
    console.log('no messages collected');
    return null;
  }
  return { title, messages };
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
        for (const item of value) arr.push(resolve(item));
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
    if (Array.isArray(input)) return input.map((item) => resolve(item));
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
        result[String(key)] = resolve(rawValue);
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
