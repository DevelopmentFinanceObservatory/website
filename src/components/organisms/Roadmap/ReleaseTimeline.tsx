import styles from './Roadmap.module.scss';
import type { ReleaseEntry } from './roadmapData';

import EntryCard from '@/components/molecules/EntryCard/EntryCard';
import Timeline from '@/components/molecules/Timeline/Timeline';

// "June 12, 2026" from an ISO date (UTC both ways, so no off-by-one-day).
export const formatReleaseDate = (iso: string): string =>
    new Date(iso).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    });

// The released items, newest first, grouped by year; a card opens the
// release panel.
const ReleaseTimeline = ({
    releases,
    onOpen,
}: {
    releases: ReleaseEntry[];
    onOpen: (release: ReleaseEntry) => void;
}) => {
    if (releases.length === 0) {
        return <p className={styles.empty}>No releases here yet.</p>;
    }

    return (
        <Timeline
            yearRows
            items={releases.map((entry) => ({
                key: entry.id,
                date: formatReleaseDate(entry.date),
                year: entry.date.slice(0, 4),
                children: (
                    <EntryCard title={entry.title} onClick={() => onOpen(entry)}>
                        {entry.text}
                    </EntryCard>
                ),
            }))}
        />
    );
};

export default ReleaseTimeline;
