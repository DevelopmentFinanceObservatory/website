'use client';

import { useEffect, useState } from 'react';

import styles from './DataSearch.module.scss';

const SEEN_KEY = 'dfo.search.refineHintSeen';

// Whether this browser has already been told. A functional preference — it
// remembers that a hint was read, it does not describe anyone — so unlike
// the usage visitor id (src/lib/events/client) it is not behind a consent
// gate. Storage can be blocked outright, and a reader who cannot be
// remembered is better shown the hint again than shown an error.
const seen = (): boolean => {
    try {
        return localStorage.getItem(SEEN_KEY) === '1';
    } catch {
        return false;
    }
};

const remember = (): void => {
    try {
        localStorage.setItem(SEEN_KEY, '1');
    } catch {
        // Nothing to do: it will be offered again next time.
    }
};

/**
 * The one-time nudge toward the sentence above: its values are editable, and
 * nothing but an underline says so.
 *
 * Doing the thing is the dismissal — there is no close button, because a
 * hint that has been acted on has nothing left to say. It watches for a tap
 * on a slot token anywhere on the page rather than being told about one,
 * which keeps the heading and the sentence body free of a flag that only
 * concerns this line. The tokens carry `styles.slot` from the stylesheet
 * this file imports, so the selector is the same hashed class they render
 * with.
 *
 * The seen flag is read straight into state rather than in an effect: this
 * sits under a resolved answer, so the subtree only ever exists on the
 * client and there is no server render to disagree with.
 */
const SearchHint = () => {
    const [hidden, setHidden] = useState(seen);

    useEffect(() => {
        if (hidden) {
            return;
        }

        // Capture, so it still counts when the token's own menu stops the
        // click from travelling any further.
        const onClick = (event: MouseEvent) => {
            if ((event.target as Element | null)?.closest?.(`.${styles.slot}`)) {
                remember();
                setHidden(true);
            }
        };

        document.addEventListener('click', onClick, true);

        return () => document.removeEventListener('click', onClick, true);
    }, [hidden]);

    if (hidden) {
        return null;
    }

    return <p className={styles.hintLine}>Tap the underlined values to refine your results</p>;
};

export default SearchHint;
