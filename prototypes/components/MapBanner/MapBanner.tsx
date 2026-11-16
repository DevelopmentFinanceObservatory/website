import styles from './MapBanner.module.scss';

import WorldMap from '@/components/atoms/WorldMap/WorldMap';

/** The site's world-map drawing as a banner, with its children laid over it. */
const MapBanner = ({ children }: { children?: React.ReactNode }) => (
    <div className={styles.banner}>
        <WorldMap className={styles.map} />
        <div className={styles.content}>{children}</div>
    </div>
);

export default MapBanner;
