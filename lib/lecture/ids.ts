import { createHash } from 'node:crypto';

type HashInput = string | number | boolean | null | HashInput[] | { [key: string]: HashInput };

function normalize(input: HashInput): string {
  if (Array.isArray(input)) {
    return `[${input.map((item) => normalize(item)).join(',')}]`;
  }
  if (input && typeof input === 'object') {
    const entries = Object.entries(input)
      .filter(([_, value]) => typeof value !== 'undefined')
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, value]) => `"${key}":${normalize(value as HashInput)}`);
    return `{${entries.join(',')}}`;
  }
  if (typeof input === 'string') {
    return JSON.stringify(input);
  }
  if (typeof input === 'number') {
    return Number.isFinite(input) ? String(input) : '"NaN"';
  }
  if (typeof input === 'boolean') {
    return input ? 'true' : 'false';
  }
  if (input === null) return 'null';
  return 'null';
}

export function hashLectureConfig(sourceUrl: string, config: Record<string, unknown>): string {
  const normalized = normalize(config as HashInput);
  const hash = createHash('sha1');
  hash.update(sourceUrl.trim());
  hash.update('\n');
  hash.update(normalized);
  return hash.digest('hex').slice(0, 16);
}

export function lectureIdFromShare(sourceUrl: string, config: Record<string, unknown>): string {
  const hash = hashLectureConfig(sourceUrl, config);
  return `lec_${hash}`;
}
