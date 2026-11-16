import Link from 'next/link';

import styles from './SiteHeader.module.scss';

import { SITE_NAME, SITE_ORIGIN } from '@/lib/site';

/** The prototypes app's header: the way back to the main site and to the
 *  prototype list. */
const SiteHeader = () => (
    <header className={styles.header}>
        <a className={styles.site} href={`${SITE_ORIGIN}/`}>
            {SITE_NAME}
        </a>
        <Link className={styles.section} href="/">
            Prototypes
        </Link>
    </header>
);

export default SiteHeader;
