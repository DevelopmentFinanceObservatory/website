'use client';

import classNames from 'classnames';

import styles from './DataSearch.module.scss';

/** What a search shows in place of its declined answer while the search
 *  API's router moves the question to Studio (a route in `auto` mode), from
 *  the answer until Studio's page replaces this one. */
const StudioMove = () => (
    <div className={classNames(styles.callout, styles.studioMove)} role="status">
        <p className={styles.calloutTitle}>Opening this question in Studio.</p>
        <p className={styles.calloutText}>
            It needs analysis. Studio can plan the analysis, run it and show its working.
        </p>
    </div>
);

export default StudioMove;
