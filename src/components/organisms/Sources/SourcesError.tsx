'use client';

import styles from './SourcesError.module.scss';

import Button from '@/components/atoms/Button/Button';
import PageHero from '@/components/molecules/PageHero/PageHero';

/**
 * Shown in place of the Sources pages when the graph could not be read.
 * `retry` re-fetches the segment on the server and re-renders it, so the
 * page comes back once the API does.
 */
const SourcesError = ({ retry }: { retry: () => void }) => (
    <main>
        <PageHero tone="light" boxMinHeight={260}>
            <h1 className={styles.title}>Sources could not be loaded</h1>
            <p className={styles.lead}>
                The data behind this page is not answering. Try again in a moment.
            </p>
            <Button variant="dark" icon="arrow" onClick={retry}>
                Try again
            </Button>
        </PageHero>
    </main>
);

export default SourcesError;
