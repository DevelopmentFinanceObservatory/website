'use client';

import classNames from 'classnames';

import IncidentList from './IncidentList';
import NotifyBox from './NotifyBox';
import ServiceRow from './ServiceRow';
import StatusChip from './StatusChip';
import { INCIDENTS, SERVICES } from './statusData';
import styles from './StatusTracker.module.scss';

import PageFade from '@/components/molecules/PageFade/PageFade';
import PageHero from '@/components/molecules/PageHero/PageHero';
import { revealIndex, useReveal } from '@/hooks/useReveal';

/**
 * Docs → Status Tracker: the light hero (title + the overall status chip,
 * "last checked" at right), then the notify box, the
 * services (rows opening to a 90-day strip and four stats) and the incident
 * history. Placeholder content (see statusData) — no status endpoint yet.
 */
const StatusTracker = () => {
    const sectionRef = useReveal<HTMLElement>();
    const allUp = SERVICES.every((s) => s.status === 'operational');

    return (
        <section ref={sectionRef} className={styles.section}>
            <PageHero
                tone="light"
                boxMinHeight={140}
                aside={
                    // No "subscribe" link here on purpose: the notify box is
                    // the very next thing on the page, so a link that only
                    // scrolls a screen's width down is noise (DFO's call).
                    <div className={styles.heroAside} data-reveal="text" style={revealIndex(1)}>
                        <p>Last checked 2 min ago.</p>
                    </div>
                }
            >
                <h1 className={styles.title} data-reveal="text">
                    Status Tracker
                    <StatusChip
                        status={allUp ? 'operational' : 'degraded'}
                        label={allUp ? 'All Systems Operational' : 'Some Systems Degraded'}
                    />
                </h1>
            </PageHero>

            <div className={styles.body}>
                <NotifyBox />

                <h2 className={styles.heading}>All Services</h2>
                <ul className={styles.services}>
                    {SERVICES.map((service, index) => (
                        <ServiceRow
                            key={service.id}
                            service={service}
                            index={index}
                            defaultOpen={index === 0}
                        />
                    ))}
                </ul>

                <h2 className={classNames(styles.heading, styles.headingIncidents)}>
                    Incident History
                </h2>
                <IncidentList incidents={INCIDENTS} />
            </div>

            <PageFade height={100} />
        </section>
    );
};

export default StatusTracker;
