'use client';

import Image from 'next/image';

import styles from './Publications.module.scss';

import Button from '@/components/atoms/Button/Button';
import PageFade from '@/components/molecules/PageFade/PageFade';
import PageHero from '@/components/molecules/PageHero/PageHero';
import { revealIndex, useReveal } from '@/hooks/useReveal';

export type PublicationCard = {
    id: string;
    title: string;
    byline: string;
    // ISO date, YYYY-MM-DD.
    publishedAt: string;
    abstract: string;
    reportUrl: string | null;
    coverSrc: string;
};

// Prints 2026-01-27 as "January 27, 2026". UTC keeps the day from shifting in
// time zones west of Greenwich.
const formatDate = (isoDate: string) =>
    new Date(`${isoDate}T00:00:00Z`).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
    });

/**
 * Insights → Publications: research and analysis built on the knowledge
 * graph, edited in cms-dfo. The dark hero (title, lead), then one row per
 * report on the light ground — the cover on the left, title / byline /
 * abstract / View Report on the right. View Report does nothing for a report
 * with no URL yet.
 */
const Publications = ({ publications }: { publications: PublicationCard[] }) => {
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
                {publications.map((publication, index) => (
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
                                {publication.byline} – {formatDate(publication.publishedAt)}
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
