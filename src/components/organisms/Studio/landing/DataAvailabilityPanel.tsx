'use client';

import Link from 'next/link';

import styles from './DataAvailabilityPanel.module.scss';

import Icon from '@/components/atoms/Icon/Icon';
import Modal from '@/components/molecules/Modal/Modal';
import { aidLine, catalogueTiles, scopeLine } from '@/lib/search/catalogue';
import {
    type DataAvailability,
    sourceDatasetCount,
    sourceHref,
} from '@/lib/studio/dataAvailability';

type DataAvailabilityPanelProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** the overview, or null while it is still being read */
    availability: DataAvailability | null;
    // Start a canvas on the data-availability question. Null past the guest
    // wall, where there is nothing to start: the action is left out.
    onAsk: (() => void) | null;
};

/**
 * The landing's "What data is available?" drawer. It shows what /data's
 * starting point shows, in a dialog: the scope line and the aid line from
 * the search catalogue's counts, the indicator and dataset tiles, and the
 * Sources page's rows, each linking to that page filtered to it. The footer
 * holds the two ways on: the Sources page, or a canvas where the agent
 * answers questions about the data.
 */
const DataAvailabilityPanel = ({
    open,
    onOpenChange,
    availability,
    onAsk,
}: DataAvailabilityPanelProps) => {
    const counts = availability?.counts ?? null;
    const aid = aidLine(counts?.aid ?? null);
    const tiles = catalogueTiles(counts && { counts });
    const sources = availability?.sources ?? [];

    return (
        <Modal
            open={open}
            onOpenChange={onOpenChange}
            title="What data is available?"
            autoFocus
            footer={
                <nav className={styles.actions} aria-label="Next steps">
                    <Link href="/data/sources" className={styles.action}>
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
            <div className={styles.body}>
                {availability ? (
                    <>
                        <p className={styles.text}>{scopeLine(counts)}</p>
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
                        {sources.length > 0 && (
                            <>
                                <p className={styles.text}>Sources:</p>
                                <ul className={styles.sources}>
                                    {sources.map((source) => (
                                        <li key={source.id} className={styles.source}>
                                            <Link
                                                href={sourceHref(source)}
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
                        )}
                    </>
                ) : (
                    <p className={styles.text} aria-live="polite">
                        Reading the catalogue…
                    </p>
                )}
            </div>
        </Modal>
    );
};

export default DataAvailabilityPanel;
