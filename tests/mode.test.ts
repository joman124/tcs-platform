import { describe, expect, it } from 'vitest';
import { isDemoMode } from '../src/data/mode';

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
