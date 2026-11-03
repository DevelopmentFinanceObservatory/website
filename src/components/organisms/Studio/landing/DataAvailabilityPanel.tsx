'use client';

import Link from 'next/link';

import styles from './DataAvailabilityPanel.module.scss';

import Icon from '@/components/atoms/Icon/Icon';
import Modal from '@/components/molecules/Modal/Modal';
import { DATA_AVAILABILITY_DATASETS, DATA_AVAILABILITY_INTRO } from '@/lib/studio/dataAvailability';

type DataAvailabilityPanelProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    // Start a canvas on the data-availability question. Null past the guest
    // wall, where there is nothing to start: the action is left out.
    onAsk: (() => void) | null;
};

/**
 * The landing's "What data is available?" drawer: the Observatory's holdings
 * in a few sentences and its core datasets, then the two ways on — the
 * Sources page, or a canvas where the agent answers questions about them.
 */
const DataAvailabilityPanel = ({ open, onOpenChange, onAsk }: DataAvailabilityPanelProps) => (
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
            {DATA_AVAILABILITY_INTRO.map((paragraph) => (
                <p key={paragraph} className={styles.text}>
                    {paragraph}
                </p>
            ))}
            <p className={styles.text}>Core datasets include:</p>
            <ul className={styles.datasets}>
                {DATA_AVAILABILITY_DATASETS.map((dataset) => (
                    <li key={dataset.name} className={styles.dataset}>
                        {dataset.name}: {dataset.summary}
                    </li>
                ))}
            </ul>
        </div>
    </Modal>
);

export default DataAvailabilityPanel;
