import { redirect } from 'next/navigation';
import { auth, signOut } from '@/auth';
import { Estimator } from '@/components/Estimator';
import { isDemo, loadData } from '@/src/data/load';
import { logConfigured } from '@/src/data/log';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const demo = isDemo();
  let userName: string | null = null;
  if (!demo) {
    const session = await auth();
    if (!session?.user) redirect('/api/auth/signin');
    userName = session.user.name ?? session.user.email ?? 'Signed in';
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
        signOutAction={demo ? null : signOutAction}
      />
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return (
      <main className="setup">
        <h1>Estimator is not ready</h1>
        <p>The provider directory could not be loaded.</p>
        <p className="mono">{message}</p>
        <p>An administrator needs to check the environment variables and that the directory workbook is shared with the app. See README.md.</p>
      </main>
    );
  }
}
