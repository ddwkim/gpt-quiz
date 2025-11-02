import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type AudioPostOptions = {
  loudness?: number; // target LUFS
  format?: 'mp3' | 'wav' | 'ogg';
};

export async function hasFfmpeg(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('ffmpeg', ['-version']);
    proc.once('error', () => resolve(false));
    proc.once('exit', (code) => resolve(code === 0));
  });
}

async function createConcatFile(paths: string[]): Promise<{ dir: string; file: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'lecture-ffmpeg-'));
  const file = join(dir, 'inputs.txt');
  const lines = paths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
  await writeFile(file, lines, 'utf8');
  return { dir, file };
}

export async function stitchSegments(
  inputPaths: string[],
  outputPath: string,
  opts: AudioPostOptions = {}
): Promise<{ ok: true; path: string } | { ok: false; reason: string }> {
  if (!inputPaths.length) {
    return { ok: false, reason: 'No segments to stitch' };
  }

  const available = await hasFfmpeg();
  if (!available) {
    return { ok: false, reason: 'ffmpeg unavailable' };
  }

  const targetFormat = opts.format ?? (outputPath.endsWith('.wav') ? 'wav' : outputPath.endsWith('.ogg') ? 'ogg' : 'mp3');
  const { dir, file } = await createConcatFile(inputPaths);

  const filters: string[] = [];
  if (typeof opts.loudness === 'number') {
    filters.push(`loudnorm=I=${opts.loudness}:TP=-1.5:LRA=11`);
  }
  const args: string[] = ['-hide_banner', '-y', '-f', 'concat', '-safe', '0', '-i', file];
  if (filters.length) {
    args.push('-filter_complex', filters.join(','));
  }
  if (targetFormat === 'mp3') {
    args.push('-c:a', 'libmp3lame', '-b:a', '192k');
  } else if (targetFormat === 'ogg') {
    args.push('-c:a', 'libvorbis', '-q:a', '4');
  } else {
    args.push('-c:a', 'pcm_s16le');
  }
  args.push(outputPath);

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('ffmpeg', args);
      let stderr = '';
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      proc.once('error', reject);
      proc.once('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr || `ffmpeg exited with ${code}`));
      });
    });
    return { ok: true, path: outputPath };
  } catch (err: any) {
    return { ok: false, reason: String(err?.message ?? err) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
