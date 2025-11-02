import { notFound } from 'next/navigation';
import { readManifest } from '@/lib/lecture/manifest';
import { LecturePlayer } from '@/components/lecture/LecturePlayer';

export default async function LectureDetailPage({ params }: { params: { id: string } }) {
  const manifest = await readManifest(params.id).catch(() => null);
  if (!manifest) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
      <LecturePlayer manifest={manifest} />
    </main>
  );
}
