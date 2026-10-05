'use client';

import Image from 'next/image';

import styles from './Publications.module.scss';
import { PUBLICATIONS } from './publicationsData';

import Button from '@/components/atoms/Button/Button';
import PageFade from '@/components/molecules/PageFade/PageFade';
import PageHero from '@/components/molecules/PageHero/PageHero';
import { revealIndex, useReveal } from '@/hooks/useReveal';

/**
 * Insights → Publications: research and analysis built on the knowledge
 * graph. The dark hero (title, lead), then one row per report on the light
 * ground — the cover on the left, title / byline / abstract / View Report
 * on the right. View Report opens the report when its link lands
 * (publicationsData holds null until the handover).
 */
const Publications = () => {
    const sectionRef = useReveal<HTMLElement>();

    return (
        <section ref={sectionRef} className={styles.section}>
            <PageHero tone="dark" boxMinHeight={260}>
                <h1 className={styles.title} data-reveal="text">
                    Publications
                </h1>
                <p className={styles.lead} data-reveal="text" style={revealIndex(1)}>
                    Research and analysis produced by the DFO team and built directly on the data in
                    the DFO knowledge graph.
                </p>
            </PageHero>

            <ul className={styles.list}>
                {PUBLICATIONS.map((publication, index) => (
                    <li key={publication.id} className={styles.row} style={revealIndex(index)}>
                        {/* unoptimized: the covers are SVG artwork — the image
                            optimizer refuses SVG and they need no resizing. */}
                        <Image
                            src={publication.coverSrc}
                            alt=""
                            width={280}
                            height={397}
                            unoptimized
                            className={styles.cover}
                        />
                        <div className={styles.body}>
                            <h2 className={styles.rowTitle}>{publication.title}</h2>
                            <p className={styles.byline}>
                                {publication.byline} – {publication.date}
                            </p>
                            <p className={styles.abstract}>{publication.abstract}</p>
                            <Button
                                icon="arrow-up-right"
                                onClick={
                                    publication.reportUrl
                                        ? () =>
                                              window.open(
                                                  publication.reportUrl!,
                                                  '_blank',
                                                  'noopener',
                                              )
                                        : undefined
                                }
                            >
                                View Report
                            </Button>
                        </div>
                    </li>
                ))}
            </ul>

            <PageFade />
        </section>
    );
};

export default Publications;
