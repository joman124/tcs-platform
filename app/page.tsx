import { redirect } from 'next/navigation';
import { auth, signOut } from '@/auth';
import { Estimator } from '@/components/Estimator';
import { benefitsConfigured } from '@/src/data/graph';
import { isDemo, loadData } from '@/src/data/load';
import { logConfigured } from '@/src/data/log';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const demo = isDemo();
  let userName: string | null = null;
  let userEmail: string | undefined;
  if (!demo) {
    const session = await auth();
    if (!session?.user) redirect('/api/auth/signin');
    userName = session.user.name ?? session.user.email ?? 'Signed in';
    userEmail = session.user.email ?? undefined;
  }
  try {
    const loaded = await loadData();
    async function signOutAction() {
      'use server';
      await signOut({ redirectTo: '/' });
    }
    return (
      <Estimator
        data={loaded.data}
        source={loaded.source}
        loadedAt={loaded.loadedAt}
        userName={userName}
        logEnabled={!demo && logConfigured()}
        benefitsSource={
          demo
            ? 'demo'
            : benefitsConfigured()
              ? {
                  clientId: process.env.AZURE_CLIENT_ID ?? '',
                  tenantId: process.env.AZURE_TENANT_ID ?? '',
                  drive: process.env.BENEFITS_DRIVE_ID || (process.env.DIRECTORY_DRIVE_ID ?? ''),
                  item: process.env.BENEFITS_ITEM_ID ?? '',
                  ...(process.env.BENEFITS_SHEET ? { sheet: process.env.BENEFITS_SHEET } : {}),
                  ...(userEmail ? { loginHint: userEmail } : {}),
                }
              : null
        }
        signOutAction={demo ? null : signOutAction}
      />
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    // An out-of-date workbook is shown instead of any prices: it would price some services wrongly.
    const outdated = e instanceof Error && e.name === 'WorkbookVersionError';
    return (
      <main className="setup">
        <h1>Estimator is not ready</h1>
        <p>{outdated ? 'The provider directory workbook is out of date, so no prices are shown.' : 'The provider directory could not be loaded.'}</p>
        <p className="mono">{message}</p>
        <p>
          {outdated
            ? 'An administrator needs to replace the workbook in SharePoint with the latest build (same file name, so the app settings stay the same), then reload this page.'
            : 'An administrator needs to check the environment variables and that the directory workbook is shared with the app. See README.md.'}
        </p>
      </main>
    );
  }
}
