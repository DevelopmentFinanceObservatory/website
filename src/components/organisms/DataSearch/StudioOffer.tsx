'use client';

import classNames from 'classnames';
import { useEffect, useRef } from 'react';

import styles from './DataSearch.module.scss';

import Button from '@/components/atoms/Button/Button';

/** The inline Studio card a search shows when the search API's router
 *  offers Studio for the question: a route in `offer` mode, shown from the
 *  route's early frame while the search keeps running beneath it, or an
 *  automatic move the reader stayed out of. A click hands the question over
 *  with the trace id the route's frame carried, or the answer's once it has
 *  landed (DataSearch's openStudio). The page shows no other Studio action
 *  meanwhile. `inPlace` is the card that takes over the move's callout in
 *  its slot: the text swaps where it stands, and only the button fades in.
 *  `onData`, given for a move a guest with no free prompt left would make,
 *  adds "Search the data instead", which searches the question as data as
 *  staying out of the move does. */
const StudioOffer = ({
    onStudio,
    onData,
    inPlace = false,
}: {
    onStudio: () => void;
    onData?: () => void;
    inPlace?: boolean;
}) => {
    const button = useRef<HTMLElement>(null);

    // The in-place card replaces the callout whose "Search the data instead"
    // button had focus, so focus would fall to the body. It lands on this
    // card's button instead.
    useEffect(() => {
        if (inPlace && (!document.activeElement || document.activeElement === document.body)) {
            button.current?.focus();
        }
    }, [inPlace]);

    return (
        <div className={classNames(styles.callout, inPlace && styles.calloutInPlace)}>
            <p className={styles.calloutTitle}>This looks like a question for Studio.</p>
            <p className={styles.calloutText}>
                Search finds and downloads data. Studio can plan the analysis, run it and show its
                working.
            </p>
            {onData ? (
                <div className={styles.actions}>
                    <Button icon="arrow" onClick={onStudio}>
                        Ask in Studio
                    </Button>
                    <Button variant="outline" onClick={onData}>
                        Search the data instead
                    </Button>
                </div>
            ) : (
                <Button
                    ref={button}
                    icon="arrow"
                    onClick={onStudio}
                    className={inPlace ? styles.offerButtonIn : undefined}
                >
                    Ask in Studio
                </Button>
            )}
        </div>
    );
};

export default StudioOffer;
