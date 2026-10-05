import { NextResponse } from 'next/server';
import { graphFetch } from '@/src/data/graph';
import { handleRetention } from '@/src/data/retention';

export const dynamic = 'force-dynamic';

/**
 * Deletes estimate-log rows older than 12 months. Meant for a Vercel Cron job (which sends `Authorization: Bearer
 * $CRON_SECRET`); off unless LOG_RETENTION_ENABLED=1, and never in demo mode. Not behind the sign-in proxy (proxy.ts),
 * because a cron call has no user session; the CRON_SECRET check replaces it.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const r = await handleRetention({ authorization: req.headers.get('authorization'), dryRun: url.searchParams.get('dryRun') === '1' }, process.env, { graph: graphFetch, now: new Date() });
  return NextResponse.json(r.body, { status: r.status });
}
