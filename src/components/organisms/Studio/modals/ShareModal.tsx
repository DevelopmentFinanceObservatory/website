'use client';

import classNames from 'classnames';
import { useEffect, useRef, useState } from 'react';

import { useCopied } from '../hooks/useCopied';
import styles from './ShareModal.module.scss';

import Button from '@/components/atoms/Button/Button';
import Icon from '@/components/atoms/Icon/Icon';
import Modal from '@/components/molecules/Modal/Modal';
import SegmentedTabs from '@/components/molecules/SegmentedTabs/SegmentedTabs';
import type { ShareKind } from '@/lib/chat/shareStore';
import type { CardRef } from '@/lib/chat/widgets';
import { downloadBlob } from '@/lib/download';
import { DATASET_FORMATS, type DatasetFormat } from '@/lib/search/searchClient';
import {
    type CardDataOptions,
    CardDownloadError,
    cardDownloadMessage,
    fetchCardData,
} from '@/lib/studio/cardDownload';

/**
 * The Share dialog. Two scopes:
 *   whole  — the header's Share: Chat + Canvas / Canvas (link + embed) / Data
 *   card   — a card's menu: Link / Embed of that one card
 * Links are minted lazily per tab (POST /api/share → frozen snapshot) and
 * cached for the dialog's lifetime. Data offers each card's rows as a file
 * from the export route (src/lib/studio/cardDownload).
 */

export type ShareScope = { kind: 'whole' } | { kind: 'card'; id: string; title: string };

// A card's downloadable data (Data tab): the revision its file is built from.
export type ShareDatum = { id: string; title: string; ref: CardRef };

type ShareModalProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    scope: ShareScope;
    // The conversation's title (embed <iframe title>).
    title: string;
    data: ShareDatum[];
    // Mints (or returns the cached) share id for a kind; null on failure.
    createShare: (kind: ShareKind, cardId?: string) => Promise<string | null>;
};

const WHOLE_TABS = [
    { id: 'conversation', label: 'Chat + Canvas' },
    { id: 'canvas', label: 'Canvas' },
    { id: 'data', label: 'Data' },
] as const;

const CARD_TABS = [
    { id: 'link', label: 'Link' },
    { id: 'embed', label: 'Embed' },
] as const;

const COPY = {
    conversation:
        'Shares the full conversation and every chart it produced, including the canvas, exactly as it is right now. It opens read-only; whatever you do here afterwards stays with you.',
    canvas: 'Shares the canvas as it looks right now — every card, its layout and your theme — without the conversation. Read-only, frozen at this moment.',
    card: 'Shares this one card, read-only, as it looks right now.',
    embed: 'Drops the read-only canvas into any page. It follows the theme it was shared with.',
    embedCard: 'Drops this card, read-only, into any page.',
    data: 'The rows behind these cards, one file per card, with their sources and citation unless you untick it.',
};

const origin = () => (typeof window === 'undefined' ? '' : window.location.origin);

const shareUrl = (id: string) => `${origin()}/s/${id}`;

const embedSnippet = (id: string, title: string) =>
    `<iframe src="${origin()}/embed/${id}" width="100%" height="640" style="border:0" title="${title.replace(/"/g, '&quot;')}"></iframe>`;

// One card on the Data tab: its title and its file from the export route, in
// the format and bundle chosen above the list.
const DataRow = ({ datum, options }: { datum: ShareDatum; options: CardDataOptions }) => {
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const download = async () => {
        setDownloading(true);
        setError(null);

        try {
            const { blob, fileName } = await fetchCardData(datum.ref, options);

            downloadBlob(blob, fileName);
        } catch (caught) {
            setError(
                caught instanceof CardDownloadError ? caught.message : cardDownloadMessage(null),
            );
        } finally {
            setDownloading(false);
        }
    };

    return (
        <li className={styles.dataRow}>
            <span className={styles.dataTitle}>{datum.title}</span>
            <Button variant="bordered" small onClick={download} disabled={downloading}>
                {downloading ? 'Preparing…' : 'Download'}
            </Button>
            {error && (
                <p className={styles.dataError} role="alert">
                    {error}
                </p>
            )}
        </li>
    );
};

// A copyable box: the value in mono, one dark Copy button; "Copied" for a beat.
const CopyBox = ({
    value,
    code,
    pending,
}: {
    value: string;
    code?: boolean;
    pending?: boolean;
}) => {
    const { copied, copy } = useCopied();

    return (
        <div
            className={classNames(styles.box, code && styles.boxCode, pending && styles.boxPending)}
        >
            <span className={styles.boxText}>{pending ? 'Creating link…' : value}</span>
            <button
                type="button"
                className={classNames(styles.copy, copied && styles.copied)}
                onClick={() => copy(value)}
                disabled={pending || !value}
                aria-label={copied ? 'Copied' : 'Copy'}
            >
                <Icon name={copied ? 'check' : 'copy'} />
            </button>
        </div>
    );
};

const ShareModal = ({ open, onOpenChange, scope, title, data, createShare }: ShareModalProps) => {
    const [tab, setTab] = useState<string>(scope.kind === 'whole' ? 'conversation' : 'link');
    // Minted ids by kind (+card id) — one link per kind per opening.
    const [ids, setIds] = useState<Record<string, string>>({});
    const [failed, setFailed] = useState(false);
    // The Data tab's file choice, shared by every card's Download.
    const [format, setFormat] = useState<DatasetFormat>('csv');
    const [bundle, setBundle] = useState(true);

    // Which share kind the current tab needs (Data needs none).
    const cardId = scope.kind === 'card' ? scope.id : undefined;
    const kind: ShareKind | null =
        scope.kind === 'card'
            ? 'card'
            : tab === 'conversation'
              ? 'conversation'
              : tab === 'canvas'
                ? 'canvas'
                : null;
    const key = kind ? `${kind}:${cardId ?? ''}` : null;
    const id = key ? ids[key] : undefined;

    // Keys whose mint is in flight (a ref: no render churn, no double POST).
    const requestedRef = useRef<Set<string>>(new Set());

    // Mint the link for the active tab once the dialog is open.
    useEffect(() => {
        if (!open || !key || !kind || key in ids || requestedRef.current.has(key)) {
            return;
        }

        requestedRef.current.add(key);
        createShare(kind, cardId).then((created) => {
            requestedRef.current.delete(key);

            if (created) {
                setIds((prev) => ({ ...prev, [key]: created }));
            } else {
                setFailed(true);
            }
        });
    }, [open, key, kind, cardId, ids, createShare]);

    const switchTab = (next: string) => {
        setTab(next);
        setFailed(false);
    };

    const tabs = scope.kind === 'whole' ? WHOLE_TABS : CARD_TABS;
    const embedTitle = scope.kind === 'card' ? scope.title : title;
    const pending = !!key && !id;
    const showLink = scope.kind === 'whole' ? tab !== 'data' : tab === 'link';
    const showEmbed = scope.kind === 'whole' ? tab === 'canvas' : tab === 'embed';

    return (
        <Modal open={open} onOpenChange={onOpenChange} title="Share" fit>
            <div className={styles.share}>
                <div className={styles.tabs}>
                    <SegmentedTabs tabs={tabs} value={tab} onChange={switchTab} />
                </div>

                {scope.kind === 'whole' && tab === 'data' ? (
                    <>
                        <p className={styles.copyText}>{COPY.data}</p>
                        {data.length === 0 ? (
                            <p className={styles.empty}>No data cards on the canvas yet.</p>
                        ) : (
                            <>
                                <div className={styles.dataOptions}>
                                    <SegmentedTabs
                                        tabs={DATASET_FORMATS}
                                        value={format}
                                        onChange={(next) => setFormat(next as DatasetFormat)}
                                    />
                                    <label className={styles.dataBundle}>
                                        <input
                                            type="checkbox"
                                            checked={bundle}
                                            onChange={(event) => setBundle(event.target.checked)}
                                        />
                                        README, sources and citation (a zip)
                                    </label>
                                </div>
                                <ul className={styles.dataList}>
                                    {data.map((datum) => (
                                        <DataRow
                                            key={datum.id}
                                            datum={datum}
                                            options={{ format, bundle }}
                                        />
                                    ))}
                                </ul>
                            </>
                        )}
                    </>
                ) : (
                    <>
                        <p className={styles.copyText}>
                            {scope.kind === 'card'
                                ? tab === 'embed'
                                    ? COPY.embedCard
                                    : COPY.card
                                : tab === 'canvas'
                                  ? COPY.canvas
                                  : COPY.conversation}
                        </p>
                        {failed && (
                            <p className={styles.error} role="alert">
                                Couldn&apos;t create the link — try again.
                            </p>
                        )}
                        {showLink && (
                            <CopyBox value={id ? shareUrl(id) : ''} pending={pending && !failed} />
                        )}
                        {showEmbed && (
                            <>
                                {scope.kind === 'whole' && (
                                    <>
                                        <hr className={styles.rule} />
                                        <h3 className={styles.sectionTitle}>
                                            <Icon name="embed" className={styles.sectionIcon} />
                                            Embed
                                        </h3>
                                        <p className={styles.copyText}>{COPY.embed}</p>
                                    </>
                                )}
                                <CopyBox
                                    value={id ? embedSnippet(id, embedTitle) : ''}
                                    code
                                    pending={pending && !failed}
                                />
                            </>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
};

export default ShareModal;
