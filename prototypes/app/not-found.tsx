import type { Metadata } from 'next';

import styles from './not-found.module.scss';

import Button from '@/components/atoms/Button/Button';
import WorldMap from '@/components/atoms/WorldMap/WorldMap';

export const metadata: Metadata = {
    title: { absolute: 'Page not found · Prototypes' },
};

/** The export's 404.html, which the Worker serves for any path under
 *  /prototypes that has no file. */
const NotFound = () => (
    <section className={styles.section}>
        <WorldMap className={styles.map} />
        <div className={styles.box}>
            <p className={styles.code}>404</p>
            <h1 className={styles.title}>Prototype not found</h1>
            <p className={styles.lead}>The link may be old, or the address mistyped.</p>
            <div className={styles.actions}>
                <Button variant="dark" icon="arrow" href="/">
                    All prototypes
                </Button>
                <Button icon="arrow-up-right" href="https://developmentfinance.org/">
                    The Observatory
                </Button>
            </div>
        </div>
    </section>
);

export default NotFound;
