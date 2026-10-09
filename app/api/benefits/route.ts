import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { lookUpBenefits } from '@/src/data/benefitsSheet';
import { demoBenefitsSheet } from '@/src/data/demo';
import { benefitsConfigured, readBenefitsSheet } from '@/src/data/graph';
import { isDemo } from '@/src/data/load';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Look up one patient's benefits by name and date of birth. The name and date of birth are used only to find the row:
 * they are not stored, cached or logged, and the answer carries only that row's benefit figures and insurance name.
 */
export async function POST(req: Request) {
  const demo = isDemo();
  if (!demo && !(await auth())?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE });
  if (!demo && !benefitsConfigured()) return NextResponse.json({ error: 'The benefits lookup is not set up.' }, { status: 404, headers: NO_STORE });
  if (Number(req.headers.get('content-length') ?? '0') > 2_000) return NextResponse.json({ error: 'Too large' }, { status: 413, headers: NO_STORE });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: NO_STORE });
  }
  const { name, dob } = (body ?? {}) as { name?: unknown; dob?: unknown };
  if (typeof name !== 'string' || name.trim().length < 2 || name.length > 80 || typeof dob !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dob) || Object.keys(body as object).length !== 2) {
    return NextResponse.json({ error: 'Enter the patient name and date of birth.' }, { status: 400, headers: NO_STORE });
  }
  try {
    const values = demo ? demoBenefitsSheet : await readBenefitsSheet();
    return NextResponse.json(lookUpBenefits(values, name, dob), { headers: NO_STORE });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'The benefits sheet could not be read.' }, { status: 502, headers: NO_STORE });
  }
}
