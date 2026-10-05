import { describe, expect, it } from 'vitest';
import { authConfigured, isDemoMode, notConfiguredResponse } from '../src/data/mode';

describe('demo mode guard', () => {
  it('is on only when explicitly requested', () => {
    expect(isDemoMode({})).toBe(false);
    expect(isDemoMode({ DEMO_MODE: '0' })).toBe(false);
    expect(isDemoMode({ DEMO_MODE: '1' })).toBe(true);
  });
  it('switches itself off when real directory or Entra settings exist', () => {
    expect(isDemoMode({ DEMO_MODE: '1', DIRECTORY_ITEM_ID: 'abc' })).toBe(false);
    expect(isDemoMode({ DEMO_MODE: '1', DIRECTORY_DRIVE_ID: 'abc' })).toBe(false);
    expect(isDemoMode({ DEMO_MODE: '1', AZURE_CLIENT_SECRET: 'x' })).toBe(false);
  });
});

describe('sign-in settings guard', () => {
  const all = { AUTH_SECRET: 's', AZURE_TENANT_ID: 't', AZURE_CLIENT_ID: 'c', AZURE_CLIENT_SECRET: 'x' };
  it('needs every sign-in setting, non-blank', () => {
    expect(authConfigured(all)).toBe(true);
    expect(authConfigured({})).toBe(false);
    for (const k of Object.keys(all)) expect(authConfigured({ ...all, [k]: undefined })).toBe(false);
    expect(authConfigured({ ...all, AUTH_SECRET: '   ' })).toBe(false);
  });

  it('answers 503: JSON for API routes, a plain page otherwise, never cached and naming no settings', async () => {
    const api = notConfiguredResponse('/api/log');
    expect(api.status).toBe(503);
    expect(await api.json()).toEqual({ error: 'The estimator is not set up yet.' });
    const page = notConfiguredResponse('/');
    expect(page.status).toBe(503);
    expect(page.headers.get('cache-control')).toBe('no-store');
    const html = await page.text();
    expect(html).toContain('Estimator is not set up yet');
    expect(html).not.toMatch(/AUTH_SECRET|AZURE_|DIRECTORY_/);
  });
});
