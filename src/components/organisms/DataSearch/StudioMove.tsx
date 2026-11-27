'use client';

import classNames from 'classnames';
import { type FocusEvent, useEffect, useEffectEvent, useState } from 'react';

import styles from './DataSearch.module.scss';

import Button from '@/components/atoms/Button/Button';

/** What a search shows while the search API's router moves the question to
 *  Studio (a route in `auto` mode): the loading view stays, with this in
 *  its status line's place, from the declined answer until Studio's sheet
 *  covers the page. Its button keeps the reader on the data search
 *  (`onStay`). The callout holds the move (`onHold`) while the pointer is
 *  over it or focus is inside it, and lets it go (`onRelease`) once both
 *  have left or the callout unmounts. */
const StudioMove = ({
    onStay,
    onHold,
    onRelease,
}: {
    onStay: () => void;
    onHold: () => void;
    onRelease: () => void;
}) => {
    const [pointerIn, setPointerIn] = useState(false);
    const [focusIn, setFocusIn] = useState(false);
    const held = pointerIn || focusIn;
    const hold = useEffectEvent(onHold);
    const release = useEffectEvent(onRelease);

    useEffect(() => {
        if (!held) {
            return;
        }

        hold();

        return () => release();
    }, [held]);

    return (
        <div
            className={classNames(styles.callout, styles.studioMove)}
            role="status"
            onPointerEnter={() => setPointerIn(true)}
            onPointerLeave={() => setPointerIn(false)}
            onFocus={() => setFocusIn(true)}
            onBlur={(event: FocusEvent<HTMLDivElement>) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                    setFocusIn(false);
                }
            }}
        >
            <p className={styles.calloutTitle}>Opening this question in Studio.</p>
            <p className={styles.calloutText}>
                It needs analysis. Studio can plan the analysis, run it and show its working.
            </p>
            <Button variant="outline" onClick={onStay}>
                Search the data instead
            </Button>
        </div>
    );
};

export default StudioMove;
