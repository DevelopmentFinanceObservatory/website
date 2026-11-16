import type { ReactNode } from 'react';

import styles from './ApiKeys.module.scss';

import PageFade from '@/components/molecules/PageFade/PageFade';
import PageHero from '@/components/molecules/PageHero/PageHero';

/** The frame of the two key pages: the light hero with the title, then the page's sections. */
const ApiKeysShell = ({
    title,
    lead,
    wide,
    children,
}: {
    title: string;
    lead: string;
    // The admin table needs more room than the account page's one column.
    wide?: boolean;
    children: ReactNode;
}) => (
    <main>
        <section className={styles.page}>
            <PageHero tone="light" boxMinHeight={140}>
                <h1 className={styles.title}>{title}</h1>
            </PageHero>
            <div className={wide ? styles.bodyWide : styles.body}>
                <p className={styles.lead}>{lead}</p>
                {children}
            </div>
            <PageFade />
        </section>
    </main>
);

export default ApiKeysShell;
