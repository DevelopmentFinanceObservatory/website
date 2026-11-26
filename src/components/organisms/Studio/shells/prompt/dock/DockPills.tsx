import classNames from 'classnames';
import { useEffect, useRef, useState } from 'react';

import styles from './PromptDock.module.scss';

import { chipAction, chipKey } from '@/lib/studio/chips';
import type { ApplyChoiceSuggestion } from '@/lib/studio/wire';

/** Which edges of a sideways scroller have more beyond them. */
const useClipped = (ref: React.RefObject<HTMLElement | null>) => {
    const [clipped, setClipped] = useState({ start: false, end: false });

    useEffect(() => {
        const el = ref.current;

        if (!el) {
            return;
        }

        const measure = () =>
            setClipped({
                start: el.scrollLeft > 1,
                end: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
            });
        const observer = new ResizeObserver(measure);

        observer.observe(el);
        el.addEventListener('scroll', measure, { passive: true });

        return () => {
            observer.disconnect();
            el.removeEventListener('scroll', measure);
        };
    }, [ref]);

    return clipped;
};

/**
 * The newest answer's suggestions above the box, one row that scrolls
 * sideways and fades at an edge with more beyond it. A press sends the
 * suggestion as the next question; a scope chip applies its choice.
 */
const DockPills = ({
    followups,
    chips,
    onFollowup,
    onChip,
}: {
    followups: string[];
    chips: ApplyChoiceSuggestion[];
    onFollowup: (text: string) => void;
    onChip: (chip: ApplyChoiceSuggestion) => void;
}) => {
    const ref = useRef<HTMLDivElement>(null);
    const clipped = useClipped(ref);

    return (
        <div
            ref={ref}
            className={classNames(
                styles.pills,
                clipped.start && styles.clippedStart,
                clipped.end && styles.clippedEnd,
            )}
            role="group"
            aria-label="Suggested next questions"
        >
            {followups.map((followup) => (
                <button
                    key={followup}
                    type="button"
                    className={styles.pill}
                    onClick={() => onFollowup(followup)}
                >
                    {followup}
                </button>
            ))}
            {chips.map((chip) => (
                <button
                    key={chipKey(chip)}
                    type="button"
                    className={styles.pill}
                    onClick={() => onChip(chip)}
                >
                    {chipAction(chip)}
                </button>
            ))}
        </div>
    );
};

export default DockPills;
