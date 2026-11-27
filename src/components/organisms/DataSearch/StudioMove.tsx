'use client';

import classNames from 'classnames';

import styles from './DataSearch.module.scss';

/** What a search shows while the search API's router moves the question to
 *  Studio (a route in `auto` mode): the loading view stays, with this in
 *  its status line's place, from the declined answer until Studio's sheet
 *  covers the page. */
const StudioMove = () => (
    <div className={classNames(styles.callout, styles.studioMove)} role="status">
        <p className={styles.calloutTitle}>Opening this question in Studio.</p>
        <p className={styles.calloutText}>
            It needs analysis. Studio can plan the analysis, run it and show its working.
        </p>
    </div>
);

export default StudioMove;
