'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

import Button from '@/components/atoms/Button/Button';
import shell from '@/components/organisms/GraphExplorer/GraphExplorer.module.scss';
import styles from '@/components/organisms/GraphExplorer/LoadStatus.module.scss';
import TopBar from '@/components/organisms/GraphExplorer/TopBar';

// A screen that fails while rendering shows this inside the section's gate,
// with the top bar over the loaded model, so the reader can retry, search or
// move to another screen. Next resets the boundary on a new pathname only,
// and search and the Explore links change the query, so a new query retries.
const GraphExplorerError = ({ error, retry }: { error: unknown; retry: () => void }) => {
    const query = useSearchParams().toString();
    const failedAt = useRef(query);

    useEffect(() => {
        console.error(error);
    }, [error]);

    useEffect(() => {
        if (query === failedAt.current) return;
        failedAt.current = query;
        retry();
    }, [query, retry]);

    return (
        <div className={shell.explorer}>
            <TopBar />
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
