'use client';

import styles from './Roadmap.module.scss';
import type { ReleaseEntry } from './roadmapData';

import { formatReleaseDate } from './ReleaseTimeline';

import Modal from '@/components/molecules/Modal/Modal';

/**
 * The release panel (the house drawer, a touch wider): when it landed, its
 * version when the track gives one, and what the release is.
 */
type ReleaseModalProps = {
    release: ReleaseEntry | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
};

const ReleaseModal = ({ release, open, onOpenChange }: ReleaseModalProps) => (
    <Modal
        open={open && release !== null}
        onOpenChange={onOpenChange}
        title={release?.title ?? ''}
        className={styles.releasePanel}
    >
        {release && (
            <div className={styles.release}>
                <dl className={styles.releaseMeta}>
                    <div>
                        <dt className={styles.releaseLabel}>Released</dt>
                        <dd className={styles.releaseValue}>{formatReleaseDate(release.date)}</dd>
                    </div>
                    {release.version && (
                        <div>
                            <dt className={styles.releaseLabel}>Version</dt>
                            <dd className={styles.releaseValue}>{release.version}</dd>
                        </div>
                    )}
                    <div className={styles.releaseWide}>
                        <dt className={styles.releaseLabel}>Summary</dt>
                        <dd className={styles.releaseValue}>{release.text}</dd>
                    </div>
                </dl>
            </div>
        )}
    </Modal>
);

export default ReleaseModal;
