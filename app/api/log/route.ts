import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isDemo, loadData } from '@/src/data/load';
import { appendLogRows, logConfigured } from '@/src/data/log';
import { validateLogPayload } from '@/src/data/logValidation';

export const dynamic = 'force-dynamic';

/** Accepts only whitelisted, de-identified rows. Anything else is rejected before it can reach SharePoint. */
export async function POST(req: Request) {
  if (!isDemo() && !(await auth())?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > 20_000) return NextResponse.json({ error: 'Too large' }, { status: 413 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  let known;
  try {
    const { data } = await loadData();
    known = { providers: new Set(data.providers.map((p) => p.id)), services: new Set(data.services.map((x) => x.id)), payers: new Set(data.payers.map((x) => x.payer)) };
  } catch {
    return NextResponse.json({ error: 'Directory unavailable' }, { status: 503 });
  }
  const v = validateLogPayload(body, known);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  if (isDemo() || !logConfigured()) return NextResponse.json({ logged: false, reason: 'Logging is not configured.' });
  try {
    await appendLogRows(v.rows);
    return NextResponse.json({ logged: true });
  } catch {
    return NextResponse.json({ logged: false, reason: 'Log write failed.' }, { status: 502 });
  }
}
