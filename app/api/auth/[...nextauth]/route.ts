import { handlers } from '@/auth';
import { authConfigured, notConfiguredResponse } from '@/src/data/mode';

// Excluded from the proxy (proxy.ts), so it needs its own guard: without sign-in settings Auth.js would throw a 500.
type Handler = (typeof handlers)['GET'];
const guard =
  (h: Handler): Handler =>
  (req) =>
    authConfigured() ? h(req) : Promise.resolve(notConfiguredResponse(new URL(req.url).pathname));

export const GET = guard(handlers.GET);
export const POST = guard(handlers.POST);
