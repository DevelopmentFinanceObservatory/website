'use client';

import classNames from 'classnames';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import styles from './Roadmap.module.scss';
import { ROADMAP_STAGES, type UpcomingEntry } from './roadmapData';

import Icon from '@/components/atoms/Icon/Icon';
import EntryCard from '@/components/molecules/EntryCard/EntryCard';
import { revealIndex } from '@/hooks/useReveal';

/**
 * The upcoming items in their stages (In Development → Planned → Under
 * Consideration): the stage title left, the cards right — "Expected: Q3
 * 2026" on the dated ones, a vote button on the ones under consideration.
 * Votes are stored per account (/api/roadmap/votes); without one, a click
 * goes to sign-in and comes back here.
 */
const UpcomingStages = ({ entries }: { entries: UpcomingEntry[] }) => {
    const router = useRouter();
    const pathname = usePathname();
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [mine, setMine] = useState<Set<string>>(new Set());

    useEffect(() => {
        fetch('/api/roadmap/votes')
            .then((res) => (res.ok ? res.json() : null))
            .then((body: { counts: Record<string, number>; mine: string[] } | null) => {
                if (body) {
                    setCounts(body.counts);
                    setMine(new Set(body.mine));
                }
            })
            .catch(() => {});
    }, []);

    const vote = async (id: string) => {
        const res = await fetch('/api/roadmap/votes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entryId: id }),
        });

        if (res.status === 401) {
            router.push(
                `/login?next=${encodeURIComponent(`${pathname}${window.location.search}`)}`,
            );

            return;
        }

        if (!res.ok) {
            return;
        }

        const { voted } = (await res.json()) as { voted: boolean };

        setMine((prev) => {
            const next = new Set(prev);

            if (voted) {
                next.add(id);
            } else {
                next.delete(id);
            }

            return next;
        });
        setCounts((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 0) + (voted ? 1 : -1)) }));
    };

    const stages = ROADMAP_STAGES.map((stage) => ({
        ...stage,
        entries: entries.filter((e) => e.stage === stage.id),
    })).filter((stage) => stage.entries.length > 0);

    if (stages.length === 0) {
        return <p className={styles.empty}>Nothing on the horizon here yet.</p>;
    }

    return (
        <>
            {stages.map((stage, stageIndex) => (
                <section key={stage.id} className={styles.stage} style={revealIndex(stageIndex)}>
                    <h2 className={styles.stageTitle}>{stage.label}</h2>
                    <ul className={styles.cards}>
                        {stage.entries.map((entry) => (
                            <li key={entry.id}>
                                <EntryCard
                                    title={entry.title}
                                    // A dated row breathes rem(40) over the text.
                                    headGap={entry.expected ? 40 : undefined}
                                    meta={
                                        entry.expected ? (
                                            <span className={styles.expected}>
                                                Expected: {entry.expected}
                                            </span>
                                        ) : entry.stage === 'consideration' ? (
                                            <button
                                                type="button"
                                                className={classNames(
                                                    styles.vote,
                                                    mine.has(entry.id) && styles.voted,
                                                )}
                                                aria-pressed={mine.has(entry.id)}
                                                onClick={() => vote(entry.id)}
                                            >
                                                <Icon name="arrow" className={styles.voteIcon} />
                                                {counts[entry.id] ?? 0} Votes
                                            </button>
                                        ) : undefined
                                    }
                                >
                                    {entry.text}
                                </EntryCard>
                            </li>
                        ))}
                    </ul>
                </section>
            ))}
        </>
    );
};

export default UpcomingStages;
