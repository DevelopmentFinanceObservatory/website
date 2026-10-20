/* eslint-disable @typescript-eslint/no-explicit-any -- takes the spec as `any` and reads only the members the panel renders, tolerating any that is missing */
'use client';

import classNames from 'classnames';
import { useEffect, useRef, useState } from 'react';

import DatasetDownload from './DatasetDownload';
import styles from './DataSearch.module.scss';
import SearchShare, { type CreateSearchShare } from './SearchShare';
import { type DatasetDownloaded, useDatasetDownload } from './useDatasetDownload';

import Button from '@/components/atoms/Button/Button';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { detailRows, downloadRowCount, formatCount } from '@/lib/search/view';

import { SourceName } from './WhyPanel';

// A single view-level share button lives above the per-part blocks in
// DataSearch.tsx.
const SearchPanel = ({
    spec,
    note,
    createShare,
    onStudio,
    onDownloadStart,
}: {
    spec: any;
    // Says a download may differ from the preview (resultNotes downloadNote).
    note?: string | null;
    // Mints this result's share links; the Share button is hidden without it.
    createShare?: CreateSearchShare;
    // Hands the question and its datasets to Studio; the Studio button is
    // hidden without it, as it is while an operation_not_applied departure
    // offers Studio.
    onStudio?: () => void;
    // Called as a download starts; records it once it reaches its file.
    onDownloadStart?: () => (downloaded: DatasetDownloaded) => void;
}) => {
    const [detailsOpen, setDetailsOpen] = useState(false);
    // The share box pops like the other menus here: 'closed' keeps it mounted
    // for its exit animation, then it unmounts.
    const [share, setShare] = useState<'open' | 'closed' | null>(null);
    const shareRef = useRef<HTMLDivElement>(null);

    // Clicking away closes the share box. The download options beside it
    // are a Radix dialog and get this for free; this box is ours. The toggle is
    // left out, so its own click closes the box instead of closing it here
    // and reopening it on the click that follows.
    useEffect(() => {
        if (share !== 'open') {
            return;
        }

        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as HTMLElement | null;

            if (
                !target ||
                shareRef.current?.contains(target) ||
                target.closest('[data-share-toggle]')
            ) {
                return;
            }

            setShare('closed');
        };

        document.addEventListener('pointerdown', onPointerDown);

        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [share]);

    const download = useDatasetDownload({
        specId: spec?.spec_id,
        definition: spec?.definition,
        entities: spec?.entities,
        onDownloadStart,
    });

    const rowCount = downloadRowCount(spec);
    const count = rowCount?.rows ?? null;

    const reducedMotion = usePrefersReducedMotion();
    const [displayCount, setDisplayCount] = useState<number | null>(null);

    // The big number counts up on entry (eased, ~1.2 s).
    useEffect(() => {
        if (count == null) {
            return;
        }

        let frame = 0;
        const start = performance.now();
        const duration = 1200;

        const tick = (now: number) => {
            if (reducedMotion) {
                setDisplayCount(count);

                return;
            }

            const t = Math.min((now - start) / duration, 1);
            const eased = 1 - (1 - t) ** 3;

            setDisplayCount(Math.round(count * eased));

            if (t < 1) {
                frame = requestAnimationFrame(tick);
            }
        };

        frame = requestAnimationFrame(tick);

        return () => cancelAnimationFrame(frame);
    }, [count, reducedMotion]);

    return (
        <aside className={styles.panel}>
            {count != null && (
                <p className={styles.count}>
                    {rowCount?.upTo && <span className={styles.countPrefix}>up to</span>}
                    {formatCount(displayCount ?? 0)}
                </p>
            )}
            <div className={styles.countRow}>
                <p className={styles.countLabel}>{count != null && 'Rows in your data'}</p>
                <Button
                    variant="plain"
                    icon="chevron-down"
                    data-open={detailsOpen}
                    onClick={() => setDetailsOpen((open) => !open)}
                >
                    Details
                </Button>
            </div>

            <div className={classNames(styles.accordion, detailsOpen && styles.accordionOpen)}>
                <div className={styles.accordionInner}>
                    <dl className={styles.details}>
                        {detailRows(spec, download.fileBytes).map((row) => (
                            <div key={row.label} className={styles.detailRow}>
                                <dt>{row.label}</dt>
                                <dd>
                                    {row.source ? (
                                        <SourceName source={row.source} label={row.value} />
                                    ) : (
                                        row.value
                                    )}
                                </dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </div>

            <div className={styles.panelActions}>
                <DatasetDownload state={download} />
                {note && <p className={styles.downloadNote}>{note}</p>}

                <div className={styles.panelButtons}>
                    {createShare && (
                        <Button
                            full
                            variant="outline"
                            data-share-toggle=""
                            className={classNames(share === 'open' && styles.shareToggleOpen)}
                            aria-expanded={share === 'open'}
                            onClick={() =>
                                setShare((state) => (state === 'open' ? 'closed' : 'open'))
                            }
                        >
                            Share
                        </Button>
                    )}
                    {onStudio && (
                        <Button full variant="outline" onClick={onStudio}>
                            Studio
                        </Button>
                    )}
                </div>

                {createShare && share && (
                    <div
                        ref={shareRef}
                        className={styles.sharePop}
                        data-state={share}
                        onAnimationEnd={() => share === 'closed' && setShare(null)}
                    >
                        <SearchShare createShare={createShare} />
                    </div>
                )}
            </div>
        </aside>
    );
};

export default SearchPanel;
