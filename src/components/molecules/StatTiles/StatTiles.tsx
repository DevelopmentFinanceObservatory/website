import styles from './StatTiles.module.scss';

import { revealIndex } from '@/hooks/useReveal';

export type StatTile = {
    value: string;
    label: string;
    logo?: React.ReactNode;
};

const StatTiles = ({ stats }: { stats: StatTile[] }) => {
    return (
        <div className={styles.stats} data-reveal-group="trigger">
            {stats.map((stat, index) => (
                <div className={styles.stat} key={stat.label} data-reveal style={revealIndex(index)}>
                    <p className={styles.statValue}>{stat.value}</p>
                    <p className={styles.statLabel}>
                        {stat.label}
                        {stat.logo}
                    </p>
                </div>
            ))}
        </div>
    );
};

export default StatTiles;
