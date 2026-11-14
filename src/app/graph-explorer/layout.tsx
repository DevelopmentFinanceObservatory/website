import type { Metadata } from 'next';
import { headers } from 'next/headers';

import { ExplorerDataProvider } from '@/components/organisms/GraphExplorer/useExplorerData';
import ReaderRefused from '@/components/organisms/ReaderRefused/ReaderRefused';
import { requireReader } from '@/lib/auth/requireReader';
import { graphExplorerSignIn, REQUEST_PATH_HEADER } from '@/lib/graphExplorer/signIn';

export const metadata: Metadata = {
    title: 'Graph Explorer — DFO',
    robots: { index: false, follow: false },
};

/**
 * The Graph Explorer's gate (lib/auth/reader.ts). A signed-out visitor goes
 * to sign in and comes back to the requested path, which src/proxy.ts
 * passes in REQUEST_PATH_HEADER; a value that is not a Graph Explorer path
 * sends them back to /graph-explorer. A refused account sees who it is and
 * a sign-out control in place of the page. An admitted reader's screens
 * share the loaded documents, which stay loaded while the reader moves
 * between them.
 */
const GraphExplorerLayout = async ({ children }: Readonly<{ children: React.ReactNode }>) => {
    const requested = (await headers()).get(REQUEST_PATH_HEADER);
    const decision = await requireReader({ signIn: graphExplorerSignIn(requested) });

    if (decision.kind !== 'admitted') {
        return <ReaderRefused email={decision.user.email} reason={decision.kind} />;
    }

    return <ExplorerDataProvider>{children}</ExplorerDataProvider>;
};

export default GraphExplorerLayout;
