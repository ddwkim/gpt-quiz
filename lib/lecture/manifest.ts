import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { LectureManifest, LectureOutline, SectionScript, TTSSegment } from '@/types/lecture';

const STORAGE_ROOT = process.env.LECTURE_STORAGE_DIR || join(process.cwd(), 'public', 'lecture');

export function lectureStorageDir(id: string): string {
  return join(STORAGE_ROOT, id);
}

export function segmentsDirFromManifest(manifest: LectureManifest): string {
  return manifest.audio.segmentsDir;
}

export async function ensureLectureDirs(id: string): Promise<{ root: string; segmentsDir: string }> {
  const root = lectureStorageDir(id);
  const segmentsDir = join(root, 'segments');
  await mkdir(segmentsDir, { recursive: true });
  return { root, segmentsDir };
}

export async function writeManifest(manifest: LectureManifest): Promise<string> {
  const dir = lectureStorageDir(manifest.id);
  await mkdir(dir, { recursive: true });
  const path = join(dir, 'manifest.json');
  await writeFile(path, JSON.stringify(manifest, null, 2), 'utf8');
  return path;
}

export async function readManifest(id: string): Promise<LectureManifest | null> {
  try {
    const data = await readFile(join(lectureStorageDir(id), 'manifest.json'), 'utf8');
    return JSON.parse(data) as LectureManifest;
  } catch (err: any) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function manifestExists(id: string): Promise<boolean> {
  try {
    await stat(join(lectureStorageDir(id), 'manifest.json'));
    return true;
  } catch {
    return false;
  }
}

export function buildManifest(args: {
  id: string;
  sourceUrl: string;
  lang: string;
  outline: LectureOutline;
  scripts: Record<string, SectionScript>;
  segments: TTSSegment[];
  audio: { format: 'mp3' | 'wav' | 'ogg'; voice: string; model: string; full?: string };
  captions?: { srt?: string; vtt?: string };
}): LectureManifest {
  const segmentsDir = `/lecture/${args.id}/segments`;
  return {
    id: args.id,
    sourceUrl: args.sourceUrl,
    lang: args.lang,
    outline: args.outline,
    scripts: args.scripts,
    segments: args.segments,
    audio: {
      segmentsDir,
      full: args.audio.full,
      format: args.audio.format,
      voice: args.audio.voice,
      model: args.audio.model
    },
    captions: args.captions,
    createdAt: new Date().toISOString(),
    version: 1
  };
}
