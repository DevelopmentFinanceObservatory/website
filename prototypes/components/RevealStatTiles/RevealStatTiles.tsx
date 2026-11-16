'use client';

import styles from './RevealStatTiles.module.scss';

import StatTiles, { type StatTile } from '@/components/molecules/StatTiles/StatTiles';
import { useReveal } from '@/hooks/useReveal';

/**
 * The site's StatTiles for an MDX page. StatTiles calls revealIndex from a
 * client module, so it renders only inside a client component, and its tiles
 * stay hidden until the site's scroll reveal (useReveal) marks them.
 */
const RevealStatTiles = ({ stats }: { stats: StatTile[] }) => {
    const ref = useReveal<HTMLDivElement>();

    return (
        <div ref={ref} className={styles.tiles}>
            <StatTiles stats={stats} />
        </div>
    );
};

export default RevealStatTiles;
