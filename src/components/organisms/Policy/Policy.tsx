import type { ReactNode } from 'react';

import styles from './Policy.module.scss';

import PageFade from '@/components/molecules/PageFade/PageFade';
import PageHero from '@/components/molecules/PageHero/PageHero';

/**
 * A plain text page (the policies the footer links to): the light hero with
 * the page's title, then one column of prose at the docs' own reading
 * scale. The page itself owns its words.
 */
const Policy = ({
    title,
    lead,
    children,
}: {
    title: string;
    // One sentence under the heading, before the sections.
    lead?: string;
    children: ReactNode;
}) => (
    <section className={styles.section}>
        <PageHero tone="light" boxMinHeight={140}>
            <h1 className={styles.title}>{title}</h1>
        </PageHero>

        <div className={styles.body}>
            {lead && <p className={styles.lead}>{lead}</p>}
            <div className={styles.prose}>{children}</div>
        </div>

        <PageFade />
    </section>
);

export default Policy;
