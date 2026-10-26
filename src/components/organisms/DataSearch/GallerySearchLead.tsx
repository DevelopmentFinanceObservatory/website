import styles from './DataSearch.module.scss';

import { gallerySourceLabels } from '@/components/organisms/Gallery/galleryData';
import type { GallerySearch } from '@/lib/crawl';

/**
 * A gallery search's title, description and sources, rendered on the server
 * so readers and crawlers have them before the share loads in the browser.
 * The title is the page's <h1> while the URL carries the share; DataSearch
 * drops its own query heading to <h2> for that time.
 */
const GallerySearchLead = ({ item }: { item: GallerySearch }) => (
    <header className={styles.lead}>
        <p className={styles.leadEyebrow}>From the Gallery</p>
        <h1 className={styles.leadTitle}>{item.title}</h1>
        <p className={styles.leadText}>{item.description}</p>
        <p className={styles.leadEyebrow}>Data from {gallerySourceLabels(item).join(', ')}</p>
    </header>
);

export default GallerySearchLead;
