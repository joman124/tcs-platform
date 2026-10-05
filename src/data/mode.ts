/**
 * Demo mode serves invented data with no sign-in. It exists only for local testing and a clearly labelled
 * preview, and it switches itself off as soon as real directory settings are present, so a leftover
 * DEMO_MODE flag can never expose real data or skip authentication.
 */
export const isDemoMode = (env: Record<string, string | undefined> = process.env): boolean =>
  env.DEMO_MODE === '1' && !env.DIRECTORY_ITEM_ID && !env.DIRECTORY_DRIVE_ID && !env.AZURE_CLIENT_SECRET;

/** Settings sign-in needs. Without all of them Auth.js cannot run, so the app shows a "not set up" page instead. */
export const AUTH_SETTINGS = ['AUTH_SECRET', 'AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET'] as const;

export const authConfigured = (env: Record<string, string | undefined> = process.env): boolean => AUTH_SETTINGS.every((k) => Boolean(env[k]?.trim()));

/**
 * Answer for a deployment that is not demo mode and has no sign-in settings (e.g. production before setup): a 503 with
 * a plain explanation, never a crash and never any data. Setting names are not listed to anonymous visitors.
 */
export function notConfiguredResponse(pathname: string): Response {
  const headers = { 'Cache-Control': 'no-store' };
  if (pathname.startsWith('/api/')) return Response.json({ error: 'The estimator is not set up yet.' }, { status: 503, headers });
  const html =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">' +
    '<title>Treatment Plan Estimator</title></head><body style="font-family:Gill Sans,Cabin,Calibri,sans-serif;color:#001654;background:#EAE8DF;max-width:640px;margin:64px auto;padding:0 16px">' +
    '<h1>Estimator is not set up yet</h1><p>Sign-in has not been configured for this site, so it cannot be used yet.</p>' +
    '<p>An administrator needs to finish the setup (docs/SETUP-CHECKLIST.md, step 6) and redeploy.</p></body></html>';
  return new Response(html, { status: 503, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } });
}
