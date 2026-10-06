'use client';

import type { AnimationEvent } from 'react';
import { useEffect, useState } from 'react';

import { WORKING, withEllipsis } from '@/lib/studio/chatLine';

import styles from './ChatPanel.module.scss';

// A label that has held this long gains an elapsed counter.
const COUNTER_AFTER_S = 5;

type StatusLineProps = {
    // What the agent is doing now; null before the first label arrives.
    status: string | null;
    detail: string | null;
    // When `status` last changed to a different label (ms epoch).
    since: number | null;
    stalled: boolean;
    onStop: () => void;
};

const formatElapsed = (seconds: number) =>
    seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;

/**
 * The live line under the latest turn: the current label (shimmering, and
 * crossfading when it changes), how long it has held, the step's detail as
 * a dim second line, and a Stop control.
 */
const StatusLine = ({ status, detail, since, stalled, onStop }: StatusLineProps) => {
    const label = status ?? WORKING;

    // The outgoing label stays mounted until its fade-out ends, stacked in
    // the same cell as the incoming one.
    const [shown, setShown] = useState({ label, previous: null as string | null });

    if (shown.label !== label) {
        setShown({ label, previous: shown.label });
    }

    const onFadeOutEnd = (event: AnimationEvent) => {
        if (event.target === event.currentTarget) {
            setShown((prev) => ({ ...prev, previous: null }));
        }
    };

    // Whole seconds since `since`, refreshed each second. A new `since`
    // starts again from zero (the counter only shows from 5 s on).
    const [elapsed, setElapsed] = useState({ since, seconds: 0 });

    if (elapsed.since !== since) {
        setElapsed({ since, seconds: 0 });
    }

    useEffect(() => {
        if (since === null) {
            return;
        }

        const timer = setInterval(() => {
            setElapsed({ since, seconds: Math.floor((Date.now() - since) / 1000) });
        }, 1000);

        return () => clearInterval(timer);
    }, [since]);

    const counter =
        !stalled && elapsed.seconds >= COUNTER_AFTER_S ? formatElapsed(elapsed.seconds) : null;

    return (
        <div className={styles.status}>
            <span className={styles.thinkingDot} />
            <div className={styles.statusBody}>
                <p className={styles.statusMain}>
                    {/* The live region holds the label and the stall note; the
                        counter stays out so it is not read every second. */}
                    <span className={styles.statusLive} role="status">
                        <span className={styles.statusLabels}>
                            {shown.previous !== null && (
                                <span
                                    key={`out-${shown.previous}`}
                                    className={styles.statusLabelOut}
                                    aria-hidden
                                    onAnimationEnd={onFadeOutEnd}
                                >
                                    {withEllipsis(shown.previous)}
                                </span>
                            )}
                            <span key={shown.label} className={styles.statusLabel}>
                                {withEllipsis(shown.label)}
                            </span>
                        </span>
                        {stalled && (
                            <span className={styles.statusNote}>· Connection seems stalled</span>
                        )}
                    </span>
                    {counter && <span className={styles.statusNote}>· {counter}</span>}
                </p>
                {detail && <p className={styles.statusDetail}>{detail}</p>}
            </div>
            <button type="button" className={styles.statusStop} onClick={onStop}>
                Stop
            </button>
        </div>
    );
};

export default StatusLine;
