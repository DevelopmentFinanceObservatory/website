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
    // An https URL, or null for a report that is not live yet.
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
 * report on the light ground, with the cover on the left and title, byline,
 * abstract and View Report on the right. A report with no URL has no View
 * Report button.
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

            {publications.length === 0 ? (
                <p className={styles.empty}>No publications to show yet.</p>
            ) : (
                <ul className={styles.list}>
                    {publications.map((publication, index) => (
                        <li key={publication.id} className={styles.row} style={revealIndex(index)}>
                            {/* unoptimized: the Sanity CDN sizes each cover (see
                            src/sanity/publications.ts), and the image
                            optimizer refuses SVG covers. */}
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
                                {publication.reportUrl && (
                                    <Button
                                        icon="arrow-up-right"
                                        href={publication.reportUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        View Report
                                    </Button>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            <PageFade />
        </section>
    );
};

export default Publications;
