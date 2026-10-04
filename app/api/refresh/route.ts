import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { clearCache, isDemo, loadData } from '@/src/data/load';

export const dynamic = 'force-dynamic';

export async function POST() {
  if (!isDemo() && !(await auth())?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    clearCache();
    const loaded = await loadData(true);
    return NextResponse.json({ loadedAt: loaded.loadedAt, source: loaded.source });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Refresh failed' }, { status: 502 });
  }
}
