import type { Metadata } from 'next';

import styles from './not-found.module.scss';

export const metadata: Metadata = { title: 'Not available — DFO Studio' };

// A deleted or unknown share, or a search share, seen inside a partner's
// iframe: one line, no site chrome.
const EmbedNotFound = () => (
    <main className={styles.message}>
        <p>This chart is no longer available.</p>
    </main>
);

export default EmbedNotFound;
