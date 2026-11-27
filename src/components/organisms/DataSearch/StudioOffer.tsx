'use client';

import styles from './DataSearch.module.scss';

import Button from '@/components/atoms/Button/Button';

/** The inline Studio card a search shows when the search API's router
 *  offers Studio for the question (a route in `offer` mode). The search
 *  keeps running beneath it, and the page shows no other Studio action. */
const StudioOffer = ({ onStudio }: { onStudio: () => void }) => (
    <div className={styles.callout}>
        <p className={styles.calloutTitle}>This looks like a question for Studio.</p>
        <p className={styles.calloutText}>
            Search finds and downloads data. Studio can plan the analysis, run it and show its
            working.
        </p>
        <Button icon="arrow" onClick={onStudio}>
            Ask in Studio
        </Button>
    </div>
);

export default StudioOffer;
