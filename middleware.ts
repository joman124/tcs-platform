import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { auth } from './auth';
import { authConfigured, isDemoMode, notConfiguredResponse } from './src/data/mode';

// Every page and API route requires a signed-in MHCA account. Demo mode (DEMO_MODE=1, local/testing only) skips auth.
const guarded = auth((req) => {
  if (!req.auth) {
    const url = new URL('/api/auth/signin', req.nextUrl.origin);
    url.searchParams.set('callbackUrl', req.nextUrl.href);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export default function middleware(req: NextRequest, ev: NextFetchEvent) {
  if (isDemoMode()) return NextResponse.next();
  // Without sign-in settings Auth.js throws on every request (a 500); say plainly that setup is unfinished instead.
  if (!authConfigured()) return notConfiguredResponse(req.nextUrl.pathname);
  return (guarded as unknown as (r: NextRequest, e: NextFetchEvent) => Response | Promise<Response>)(req, ev);
}

// api/log-retention is a cron endpoint with no user session; it checks CRON_SECRET itself (src/data/retention.ts).
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth|api/log-retention).*)'] };
