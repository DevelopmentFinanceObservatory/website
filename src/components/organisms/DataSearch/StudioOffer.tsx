'use client';

import classNames from 'classnames';

import styles from './DataSearch.module.scss';

import Button from '@/components/atoms/Button/Button';

/** The inline Studio card a search shows when the search API's router
 *  offers Studio for the question: a route in `offer` mode, shown from the
 *  route's early frame while the search keeps running beneath it, or an
 *  automatic move the reader stayed out of. A click hands the question over
 *  with the trace id the route's frame carried, or the answer's once it has
 *  landed (DataSearch's openStudio). The page shows no other Studio action
 *  meanwhile. `inPlace` is the card that takes over the move's callout in
 *  its slot: the text swaps where it stands, and only the button fades in. */
const StudioOffer = ({
    onStudio,
    inPlace = false,
}: {
    onStudio: () => void;
    inPlace?: boolean;
}) => (
    <div className={classNames(styles.callout, inPlace && styles.calloutInPlace)}>
        <p className={styles.calloutTitle}>This looks like a question for Studio.</p>
        <p className={styles.calloutText}>
            Search finds and downloads data. Studio can plan the analysis, run it and show its
            working.
        </p>
        <Button
            icon="arrow"
            onClick={onStudio}
            className={inPlace ? styles.offerButtonIn : undefined}
        >
            Ask in Studio
        </Button>
    </div>
);

export default StudioOffer;
