'use client';

import { useRouter } from 'next/navigation';

import styles from './NotFound.module.scss';

import Button from '@/components/atoms/Button/Button';
import { revealIndex, useReveal } from '@/hooks/useReveal';
import WorldMap from '@/assets/svg/world-map.svg';

/**
 * The 404: the light hero, page-tall — the map lines, the pale box with a
 * big "404", one line of copy and the ways out (home, the data search).
 */
const NotFound = () => {
    const sectionRef = useReveal<HTMLElement>();
    const router = useRouter();

    return (
        <section ref={sectionRef} className={styles.section}>
            <WorldMap
                className={styles.mapBg}
                preserveAspectRatio="xMidYMid slice"
                aria-hidden="true"
            />
            <div className={styles.box}>
                <p className={styles.code} data-reveal="text">
                    404
                </p>
                <h1 className={styles.title} data-reveal="text" style={revealIndex(1)}>
                    Page not found
                </h1>
                <p className={styles.lead} data-reveal="text" style={revealIndex(2)}>
                    This page isn’t in the graph. The link may be old, or the address mistyped.
                </p>
                {/* Not on the scroll reveal: the buttons sit at the fold's foot,
                    outside the reveal band — they fade in on their own. */}
                <div className={styles.actions}>
                    <Button variant="dark" icon="arrow" onClick={() => router.push('/')}>
                        Back to home
                    </Button>
                    <Button icon="arrow-up-right" onClick={() => router.push('/data')}>
                        Get Data
                    </Button>
                </div>
            </div>
        </section>
    );
};

export default NotFound;
