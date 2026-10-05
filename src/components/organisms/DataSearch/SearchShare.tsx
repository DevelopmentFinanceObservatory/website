'use client';

import classNames from 'classnames';
import { useEffect, useRef, useState } from 'react';

import styles from './DataSearch.module.scss';

import Button from '@/components/atoms/Button/Button';
import Icon from '@/components/atoms/Icon/Icon';
import SegmentedTabs from '@/components/molecules/SegmentedTabs/SegmentedTabs';
import type { SearchShareMode } from '@/lib/search/searchClient';
import { shareFailureText } from '@/lib/search/shareMessage';

export type CreateSearchShare = (
    mode: SearchShareMode,
) => Promise<{ id: string } | { refused: string | null }>;

const TABS = [
    { id: 'live', label: 'Live Data' },
    { id: 'snapshot', label: 'Snapshot' },
] as const;

const COPY: Record<SearchShareMode, string> = {
    live: 'Always re-runs the query for the latest data. Results may change as sources refresh.',
    snapshot: 'Freezes the results as they are right now. The link keeps showing this exact data.',
};

/**
 * Share for a search result: live data (the default) or a snapshot, one link
 * each, minted the first time its tab is shown and kept for as long as the
 * box is open. A snapshot takes a moment longer — the data is captured first.
 */
const SearchShare = ({ createShare }: { createShare: CreateSearchShare }) => {
    const [mode, setMode] = useState<SearchShareMode>('live');
    const [ids, setIds] = useState<Partial<Record<SearchShareMode, string>>>({});
    const [failed, setFailed] = useState<Partial<Record<SearchShareMode, string>>>({});
    const [copied, setCopied] = useState(false);
    const requestedRef = useRef<Set<SearchShareMode>>(new Set());

    useEffect(() => {
        if (ids[mode] || failed[mode] || requestedRef.current.has(mode)) {
            return;
        }

        requestedRef.current.add(mode);
        createShare(mode).then((result) => {
            requestedRef.current.delete(mode);

            if ('id' in result) {
                setIds((prev) => ({ ...prev, [mode]: result.id }));
            } else {
                setFailed((prev) => ({ ...prev, [mode]: shareFailureText(mode, result.refused) }));
            }
        });
    }, [mode, ids, failed, createShare]);

    const switchTo = (next: SearchShareMode) => {
        // Coming back to a tab whose link failed tries again.
        setFailed((prev) => ({ ...prev, [next]: undefined }));
        setCopied(false);
        setMode(next);
    };

    useEffect(() => {
        if (!copied) {
            return;
        }

        const timer = window.setTimeout(() => setCopied(false), 1600);

        return () => window.clearTimeout(timer);
    }, [copied]);

    const id = ids[mode];
    const url = id ? `${window.location.origin}/s/${id}` : '';

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
                <div className={styles.shareLink}>
                    <span className={classNames(styles.shareUrl, !id && styles.shareUrlPending)}>
                        {id ? url.replace(/^https?:\/\//, '') : 'Creating link…'}
                    </span>
                    <button
                        type="button"
                        className={classNames(styles.shareCopyButton, copied && styles.shareCopied)}
                        disabled={!id}
                        aria-label={copied ? 'Copied' : 'Copy link'}
                        onClick={() =>
                            navigator.clipboard.writeText(url).then(
                                () => setCopied(true),
                                () => {},
                            )
                        }
                    >
                        <Icon name={copied ? 'check' : 'copy'} />
                    </button>
                </div>
            )}
        </div>
    );
};

export default SearchShare;
