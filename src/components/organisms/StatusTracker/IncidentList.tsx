'use client';

import { useState } from 'react';

import StatusChip from './StatusChip';
import styles from './StatusTracker.module.scss';
import { type Incident, INCIDENTS_PREVIEW } from './statusData';

import Button from '@/components/atoms/Button/Button';
import EntryCard from '@/components/molecules/EntryCard/EntryCard';
import { revealIndex } from '@/hooks/useReveal';

const formatDate = (iso: string): string =>
    new Date(iso).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    });

// The incident history: the date chip glued to a white card (title,
// "Resolved", the text, Duration / Affected / Time); the first few, then
// View All for the rest.
const IncidentList = ({ incidents }: { incidents: Incident[] }) => {
    const [showAll, setShowAll] = useState(false);
    const shown = showAll ? incidents : incidents.slice(0, INCIDENTS_PREVIEW);

    return (
        <>
            <ol className={styles.incidents}>
                {shown.map((incident, index) => (
                    <li key={incident.id} className={styles.incident} style={revealIndex(index)}>
                        <span className={styles.incidentDate}>{formatDate(incident.date)}</span>
                        <EntryCard
                            title={incident.title}
                            headGap={40}
                            meta={
                                incident.resolved ? (
                                    <StatusChip status="operational" label="Resolved" check />
                                ) : undefined
                            }
                        >
                            {incident.text}
                            <dl className={styles.incidentFacts}>
                                <div>
                                    <dt>Duration</dt>
                                    <dd>{incident.duration}</dd>
                                </div>
                                <div>
                                    <dt>Affected Services</dt>
                                    <dd>{incident.affected}</dd>
                                </div>
                                <div>
                                    <dt>Time</dt>
                                    <dd>{incident.time}</dd>
                                </div>
                            </dl>
                        </EntryCard>
                    </li>
                ))}
            </ol>
            {incidents.length > INCIDENTS_PREVIEW && (
                <div className={styles.viewAll}>
                    <Button variant="dark" onClick={() => setShowAll((prev) => !prev)}>
                        {showAll ? 'View Less' : 'View All'}
                    </Button>
                </div>
            )}
        </>
    );
};

export default IncidentList;
