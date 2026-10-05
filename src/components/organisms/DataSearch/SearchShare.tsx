'use client';

import classNames from 'classnames';
import { Fragment, useEffect, useRef, useState } from 'react';

import styles from './DataSearch.module.scss';

import Button from '@/components/atoms/Button/Button';
import Icon from '@/components/atoms/Icon/Icon';
import SegmentedTabs from '@/components/molecules/SegmentedTabs/SegmentedTabs';
import type { SearchShareMode } from '@/lib/search/searchClient';
import { shareDownloadLinks } from '@/lib/search/shareDownload';
import { shareFailureText } from '@/lib/search/shareMessage';

/** A dataset in a share: its part's position, the spec it resolved to, and its name. */
export type SharedDataset = { partIndex: number; specId: string; label: string };

/**
 * Mints a share and answers with the datasets it stored, so the download
 * links name the parts of the same mint as the share link.
 */
export type CreateSearchShare = (
    mode: SearchShareMode,
) => Promise<{ id: string; datasets: SharedDataset[] } | { refused: string | null }>;

type MintedShare = { id: string; datasets: SharedDataset[] };

const TABS = [
    { id: 'live', label: 'Live Data' },
    { id: 'snapshot', label: 'Snapshot' },
] as const;

const COPY: Record<SearchShareMode, string> = {
    live: 'Always re-runs the query for the latest data. Results may change as sources refresh.',
    snapshot: 'Freezes the results as they are right now. The link keeps showing this exact data.',
};

const DOWNLOAD_COPY: Record<SearchShareMode, string> = {
    live: 'Downloads the latest data as a zip, with its citation.',
    snapshot: 'Downloads this frozen data as a zip, with its citation.',
};

/** A URL and the button that copies it; the tick shows for a moment after. */
const CopyRow = ({ url, label }: { url: string | null; label: string }) => {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) {
            return;
        }

        const timer = window.setTimeout(() => setCopied(false), 1600);

        return () => window.clearTimeout(timer);
    }, [copied]);

    return (
        <div className={styles.shareLink}>
            <span className={classNames(styles.shareUrl, !url && styles.shareUrlPending)}>
                {url ? url.replace(/^https?:\/\//, '') : 'Creating link…'}
            </span>
            <button
                type="button"
                className={classNames(styles.shareCopyButton, copied && styles.shareCopied)}
                disabled={!url}
                aria-label={copied ? 'Copied' : label}
                onClick={() =>
                    url &&
                    navigator.clipboard.writeText(url).then(
                        () => setCopied(true),
                        () => {},
                    )
                }
            >
                <Icon name={copied ? 'check' : 'copy'} />
            </button>
        </div>
    );
};

/**
 * Share for a search result: live data (the default) or a snapshot, one link
 * each, minted the first time its tab is shown and kept for as long as the
 * box is open. A snapshot takes a moment longer — the data is captured first.
 */
const SearchShare = ({ createShare }: { createShare: CreateSearchShare }) => {
    const [mode, setMode] = useState<SearchShareMode>('live');
    const [minted, setMinted] = useState<Partial<Record<SearchShareMode, MintedShare>>>({});
    const [failed, setFailed] = useState<Partial<Record<SearchShareMode, string>>>({});
    const requestedRef = useRef<Set<SearchShareMode>>(new Set());

    useEffect(() => {
        if (minted[mode] || failed[mode] || requestedRef.current.has(mode)) {
            return;
        }

        requestedRef.current.add(mode);
        createShare(mode).then((result) => {
            requestedRef.current.delete(mode);

            if ('id' in result) {
                setMinted((prev) => ({ ...prev, [mode]: result }));
            } else {
                setFailed((prev) => ({ ...prev, [mode]: shareFailureText(mode, result.refused) }));
            }
        });
    }, [mode, minted, failed, createShare]);

    const switchTo = (next: SearchShareMode) => {
        // Coming back to a tab whose link failed tries again.
        setFailed((prev) => ({ ...prev, [next]: undefined }));
        setMode(next);
    };

    const share = minted[mode];
    const origin = window.location.origin;
    const downloads = share ? shareDownloadLinks(share.id, share.datasets) : [];

    return (
        <div className={styles.share}>
            <p className={styles.shareTitle}>Share</p>
            <div className={styles.shareTabs}>
                <SegmentedTabs
                    tabs={TABS}
                    value={mode}
                    onChange={(next) => switchTo(next as SearchShareMode)}
                />
            </div>
            <p className={styles.shareCopy}>{COPY[mode]}</p>
            {failed[mode] ? (
                <>
                    <p className={styles.shareError} role="alert">
                        {failed[mode]}
                    </p>
                    {mode === 'snapshot' && (
                        <Button variant="outline" onClick={() => switchTo('live')}>
                            Share live data instead
                        </Button>
                    )}
                </>
            ) : (
                // Keyed by mode so a tab switch clears the copied ticks.
                <Fragment key={mode}>
                    <CopyRow url={share ? `${origin}/s/${share.id}` : null} label="Copy link" />
                    {downloads.length > 0 && (
                        <div className={styles.shareDownloads}>
                            <p className={styles.shareDownloadsTitle}>
                                {downloads.length > 1 ? 'Download links' : 'Download link'}
                            </p>
                            <p className={styles.shareCopy}>{DOWNLOAD_COPY[mode]}</p>
                            {downloads.map(({ path, ref }) => (
                                <div key={path} className={styles.shareDownload}>
                                    {ref && (
                                        <p className={styles.shareDownloadLabel}>{ref.label}</p>
                                    )}
                                    <CopyRow
                                        url={`${origin}${path}`}
                                        label={
                                            ref
                                                ? `Copy download link for ${ref.label}`
                                                : 'Copy download link'
                                        }
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </Fragment>
            )}
        </div>
    );
};

export default SearchShare;
