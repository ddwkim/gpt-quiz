import { NextRequest } from 'next/server';
import { conversationFromPlaintext, extractFromShare } from '@/lib/extract';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url) {
    return new Response('Missing url', { status: 400 });
  }
  try {
    const conversation = await extractFromShare(url);
    return Response.json(conversation);
  } catch (error: any) {
    return new Response(error?.message ?? 'extract failed', { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { transcript?: string } | null;
  if (!body?.transcript) {
    return new Response('Missing transcript', { status: 400 });
  }
  try {
    const conversation = conversationFromPlaintext(body.transcript);
    return Response.json(conversation);
  } catch (error: any) {
    return new Response(error?.message ?? 'failed', { status: 400 });
  }
}
