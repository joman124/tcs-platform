/**
 * Demo mode serves invented data with no sign-in. It exists only for local testing and a clearly labelled
 * preview, and it switches itself off as soon as real directory settings are present, so a leftover
 * DEMO_MODE flag can never expose real data or skip authentication.
 */
export const isDemoMode = (env: Record<string, string | undefined> = process.env): boolean =>
  env.DEMO_MODE === '1' && !env.DIRECTORY_ITEM_ID && !env.DIRECTORY_DRIVE_ID && !env.AZURE_CLIENT_SECRET;
