'use client';

import { useMemo } from 'react';

import styles from './DataSearch.module.scss';
import { TokenAbout } from './TokenAbout';

import Button from '@/components/atoms/Button/Button';
import { isClosestMatch } from '@/lib/search/departures';
import { basisNote, readingOf, readingsSummary } from '@/lib/search/readings';
import { tokenAbout } from '@/lib/search/tokenAbout';
import type { CandidatesPart, Spec } from '@/lib/search/types';
import { statVarsUnreadable } from '@/lib/search/view';

/**
 * A candidates part's readings, one card per candidate spec: the reading's
 * heading and byline as plain text, since an edit to a reading the reader
 * has not chosen has nothing to apply to, and its measure's About block
 * shown open, since the definition is what tells two readings apart. A
 * rival reading leads with why the part offers it (`basis`). The card's
 * one action picks the reading. The part's own summary plan is the
 * block's screen-reader text, and a closest-match part draws its lead once
 * above the cards.
 */
const ReadingCards = ({
    part,
    prefix,
    onPick,
    onRetry,
}: {
    part: CandidatesPart;
    // The part's variable text, when the answer has several parts.
    prefix: string | null;
    onPick: (spec: Spec) => void;
    // Re-runs the question, for a reading the client could not read.
    onRetry: () => void;
}) => {
    const specs = useMemo(() => part.candidates.specs, [part]);
    const readings = useMemo(
        () =>
            specs.map((spec) => {
                const reading = readingOf(spec);
                const measure = reading.measure ?? {
                    kind: 'slot' as const,
                    axis: 'what' as const,
                    text: reading.heading,
                    segment: 'heading' as const,
                };

                return {
                    spec,
                    reading,
                    note: basisNote(spec.basis),
                    about: tokenAbout(measure, spec, reading.statedElsewhere),
                };
            }),
        [specs],
    );

    return (
        <div className={styles.cardsBlock}>
            {isClosestMatch(part) && <p className={styles.closestLead}>Closest match</p>}
            <p className={styles.cardsTitle} aria-hidden="true">
                {prefix && `${prefix}: `}
                {readings.length} {readings.length === 1 ? 'reading' : 'readings'}. Use the one you
                meant…
            </p>
            <p className={styles.readingsSummary}>
                {prefix && `${prefix}: `}
                {readingsSummary(part.sentence_plan)}
            </p>
            <ul className={styles.cards}>
                {readings.map(({ spec, reading, note, about }, index) => (
                    <li
                        key={spec.spec_id}
                        className={styles.readingCard}
                        style={{ '--i': index } as React.CSSProperties}
                    >
                        {statVarsUnreadable(spec) ? (
                            <>
                                <p className={styles.cardTitleUnreadable}>
                                    Couldn&rsquo;t read this result
                                </p>
                                <Button
                                    variant="outline"
                                    small
                                    className={styles.cardRetry}
                                    onClick={onRetry}
                                >
                                    Retry the search
                                </Button>
                            </>
                        ) : (
                            <>
                                {note && <p className={styles.cardBasis}>{note}</p>}
                                <div aria-hidden="true">
                                    <p className={styles.cardTitle}>{reading.heading}</p>
                                    {reading.byline && (
                                        <p className={styles.cardMeta}>{reading.byline}</p>
                                    )}
                                </div>
                                <div className={styles.readingAbout}>
                                    <TokenAbout about={about} />
                                </div>
                                <Button
                                    variant="outline"
                                    small
                                    className={styles.cardRetry}
                                    aria-label={`Use this reading: ${reading.heading}`}
                                    onClick={() => onPick(spec)}
                                >
                                    Use this reading
                                </Button>
                            </>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default ReadingCards;
