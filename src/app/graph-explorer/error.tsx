'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import Button from '@/components/atoms/Button/Button';
import shell from '@/components/organisms/GraphExplorer/GraphExplorer.module.scss';
import styles from '@/components/organisms/GraphExplorer/LoadStatus.module.scss';
import TopBar, { type GraphExplorerScreen } from '@/components/organisms/GraphExplorer/TopBar';
import { CHECK_SHEET_PATH, NEW_SHEET_PATH } from '@/lib/graphExplorer/paths';

const screenOf = (path: string): GraphExplorerScreen => {
    if (path.startsWith(NEW_SHEET_PATH)) return 'new-sheet';
    if (path.startsWith(CHECK_SHEET_PATH)) return 'check-sheet';
    return 'explore';
};

// A screen that fails while rendering shows this inside the section's gate,
// with the top bar, so the reader can retry or move to another screen.
const GraphExplorerError = ({ error, retry }: { error: unknown; retry: () => void }) => {
    const path = usePathname();

    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <div className={shell.explorer}>
            <TopBar screen={screenOf(path)} model={null} />
            <main className={shell.main}>
                <div className={styles.status} role="alert">
                    <h1 className={styles.title}>This screen stopped on an error</h1>
                    <p className={styles.message}>
                        Try again, or move to another screen from the bar above.
                    </p>
                    <div>
                        <Button onClick={retry}>Try Again</Button>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default GraphExplorerError;
