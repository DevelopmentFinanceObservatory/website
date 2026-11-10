'use client';

import Link from 'next/link';

import styles from './DataAvailabilityPanel.module.scss';

import Icon from '@/components/atoms/Icon/Icon';
import Modal from '@/components/molecules/Modal/Modal';
import { aidLine, type CatalogueCounts, catalogueTiles, scopeLine } from '@/lib/search/catalogue';
import {
    type DataSource,
    type Half,
    sourceDatasetCount,
    sourceHref,
} from '@/lib/studio/dataAvailability';

type DataAvailabilityPanelProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** the search catalogue's counts */
    counts: Half<CatalogueCounts>;
    /** the Sources page's rows */
    sources: Half<DataSource[]>;
    // Start a canvas on the data-availability question. Null past the guest
    // wall, where there is nothing to start, so the action is left out.
    onAsk: (() => void) | null;
};

const isPending = (half: Half<unknown>): boolean =>
    half.status === 'unread' || half.status === 'reading';

/**
 * The landing's "What data is available?" drawer. From the search
 * catalogue's counts it shows the scope line, the aid line, and the
 * indicator and dataset tiles. Below them come the Sources page's rows, each
 * with its dataset count and a link to that page filtered to it. Each half
 * shows its own placeholder until it arrives, and a failed half shows as
 * empty. The footer links to the Sources page and offers a canvas where the
 * agent answers questions about the data.
 *
 * Every link here sets `prefetch={false}` because /data/sources is
 * force-dynamic, and a viewport prefetch renders it in full, one graph read
 * per link.
 */
const DataAvailabilityPanel = ({
    open,
    onOpenChange,
    counts,
    sources,
    onAsk,
}: DataAvailabilityPanelProps) => {
    const read = counts.status === 'read' ? counts.value : null;
    const aid = aidLine(read?.aid ?? null);
    const tiles = catalogueTiles(read && { counts: read });
    const rows = sources.status === 'read' ? sources.value : [];

    return (
        <Modal
            open={open}
            onOpenChange={onOpenChange}
            title="What data is available?"
            autoFocus
            footer={
                <nav className={styles.actions} aria-label="Next steps">
                    <Link href="/data/sources" prefetch={false} className={styles.action}>
                        Browse Sources
                        <Icon name="arrow" className={styles.actionIcon} />
                    </Link>
                    {onAsk && (
                        <button type="button" className={styles.action} onClick={onAsk}>
                            Ask a follow-up
                            <Icon name="arrow" className={styles.actionIcon} />
                        </button>
                    )}
                </nav>
            }
        >
            {/* One live region covers both halves. Each placeholder is swapped
                for its content when its read settles, and the region reads
                the change out once neither half is pending. */}
            <div
                className={styles.body}
                aria-live="polite"
                aria-busy={isPending(counts) || isPending(sources)}
            >
                {isPending(counts) ? (
                    <p className={styles.text}>Reading the catalogue…</p>
                ) : (
                    <>
                        <p className={styles.text}>{scopeLine(read)}</p>
                        {aid && <p className={styles.text}>{aid}</p>}
                        {tiles.length > 0 && (
                            <dl className={styles.facts}>
                                {tiles.map((tile) => (
                                    <div key={tile.label} className={styles.fact}>
                                        <dt className={styles.factLabel}>{tile.label}</dt>
                                        <dd className={styles.factValue}>{tile.value}</dd>
                                    </div>
                                ))}
                            </dl>
                        )}
                    </>
                )}
                {isPending(sources) ? (
                    <p className={styles.text}>Reading the sources…</p>
                ) : (
                    rows.length > 0 && (
                        <>
                            <p className={styles.text}>Sources:</p>
                            <ul className={styles.sources}>
                                {rows.map((source) => (
                                    <li key={source.id} className={styles.source}>
                                        <Link
                                            href={sourceHref(source)}
                                            prefetch={false}
                                            className={styles.sourceLink}
                                        >
                                            {source.label}
                                        </Link>
                                        <span className={styles.sourceCount}>
                                            {sourceDatasetCount(source.count)}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )
                )}
            </div>
        </Modal>
    );
};

export default DataAvailabilityPanel;
