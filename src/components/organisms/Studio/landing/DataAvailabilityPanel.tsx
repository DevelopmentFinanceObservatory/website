'use client';

import Link from 'next/link';

import styles from './DataAvailabilityPanel.module.scss';

import Icon from '@/components/atoms/Icon/Icon';
import Modal from '@/components/molecules/Modal/Modal';
import { scopeLine } from '@/lib/search/catalogue';
import {
    type DataAvailability,
    dataFacts,
    datasetCount,
    publisherHref,
} from '@/lib/studio/dataAvailability';

type DataAvailabilityPanelProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** what the server read (lib/studio/dataAvailabilityLoader.ts) */
    availability: DataAvailability;
    // Start a canvas on the data-availability question. Null past the guest
    // wall, where there is nothing to start: the action is left out.
    onAsk: (() => void) | null;
};

/**
 * The landing's "What data is available?" drawer: /data's starting point
 * in a dialog. The scope line and the counts come from the search
 * catalogue, the publishers from the graph's source catalogue, each linking
 * to the Sources page filtered to it. Then the two ways on — the Sources
 * page, or a canvas where the agent answers questions about the data.
 */
const DataAvailabilityPanel = ({
    open,
    onOpenChange,
    availability,
    onAsk,
}: DataAvailabilityPanelProps) => {
    const facts = dataFacts(availability.counts);
    const publishers = availability.publishers ?? [];

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
                <p className={styles.text}>{scopeLine(availability.counts)}</p>
                {facts.length > 0 && (
                    <dl className={styles.facts}>
                        {facts.map((fact) => (
                            <div key={fact.label} className={styles.fact}>
                                <dt className={styles.factLabel}>{fact.label}</dt>
                                <dd className={styles.factValue}>{fact.value}</dd>
                            </div>
                        ))}
                    </dl>
                )}
                {publishers.length > 0 && (
                    <>
                        <p className={styles.text}>Data comes from:</p>
                        <ul className={styles.publishers}>
                            {publishers.map((publisher) => (
                                <li key={publisher.id} className={styles.publisher}>
                                    <Link
                                        href={publisherHref(publisher)}
                                        className={styles.publisherLink}
                                    >
                                        {publisher.label}
                                    </Link>
                                    <span className={styles.publisherCount}>
                                        {datasetCount(publisher.count)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </div>
        </Modal>
    );
};

export default DataAvailabilityPanel;
