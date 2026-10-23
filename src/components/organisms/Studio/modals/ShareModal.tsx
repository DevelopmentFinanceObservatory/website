'use client';

import classNames from 'classnames';
import { useEffect, useRef, useState } from 'react';

import { useCopied } from '../hooks/useCopied';
import { browserLiveDeps } from '../hooks/useLiveCards';
import styles from './ShareModal.module.scss';

import Button from '@/components/atoms/Button/Button';
import Icon from '@/components/atoms/Icon/Icon';
import Modal from '@/components/molecules/Modal/Modal';
import SegmentedTabs from '@/components/molecules/SegmentedTabs/SegmentedTabs';
import type { ShareMode, StudioShareKind } from '@/lib/chat/shareMode';
import type { CardRef } from '@/lib/chat/widgets';
import { downloadBlob } from '@/lib/download';
import { DATASET_FORMATS, type DatasetFormat } from '@/lib/search/searchClient';
import {
    type CardDataOptions,
    CardDownloadError,
    cardDownloadMessage,
    fetchCardData,
} from '@/lib/studio/cardDownload';
import {
    checkingText,
    openShareLink,
    type ShareLink,
    type ShareLinkDeps,
    shareLinkKey,
    shareModeFor,
    snapshotShare,
    uncheckedText,
    withdrawalText,
} from '@/lib/studio/shareDialog';

/**
 * The Share dialog. Two scopes:
 *   whole  — the header's Share: Chat + Canvas / Canvas (link + embed) / Data
 *   card   — a card's menu: Link / Embed of that one card
 * A canvas or a card is shared as Live Data (the default) or as a Snapshot
 * when `offerLive` is set; Chat + Canvas is always a snapshot, and so is
 * every share when it is not. Links are made lazily, one per tab and mode
 * (`openShareLink` in src/lib/studio/shareDialog), and kept for the dialog's
 * lifetime. A live link is shown once every data card it holds has been
 * checked, and withdrawn when one cannot refresh. Data offers each card's
 * stored rows as a file from the export route (src/lib/studio/cardDownload).
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
    // Whether this scope can be shared live, which needs a site that can
    // refresh cards and a canvas, or a card, that draws data. Off, the dialog
    // has no mode choice and every link is a snapshot.
    offerLive: boolean;
    createShare: ShareLinkDeps['createShare'];
    // The links belong to the caller, who can switch a live one to a
    // snapshot. A guest's links are unowned and keep their mode.
    owned: boolean;
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

const MODE_TABS = [
    { id: 'live', label: 'Live Data' },
    { id: 'snapshot', label: 'Snapshot' },
] as const;

const COPY = {
    conversation:
        'Shares the full conversation and every chart it produced, including the canvas, exactly as it is right now. It opens read-only; whatever you do here afterwards stays with you.',
    conversationOnly:
        'Chat + Canvas is always a snapshot, because the conversation quotes its numbers.',
    canvas: {
        live: 'Shares the canvas without the conversation: every card, its layout and your theme. Read-only. Each data card shows the latest data whenever the link opens, and your titles, notes and text stay as written.',
        snapshot:
            'Shares the canvas as it looks right now — every card, its layout and your theme — without the conversation. Read-only, frozen at this moment.',
    },
    card: {
        live: 'Shares this one card, read-only. It shows the latest data whenever the link opens.',
        snapshot: 'Shares this one card, read-only, as it looks right now.',
    },
    embed: 'Drops the read-only canvas into any page. It follows the theme it was shared with.',
    embedCard: {
        live: 'Drops this card, read-only, into any page. It shows the latest data whenever the page loads.',
        snapshot: 'Drops this card, read-only, into any page.',
    },
    data: 'The rows behind these cards, one file per card, with their sources and citation unless you untick it.',
    toSnapshot:
        'To stop live updates, make this link a snapshot. Everyone who has the link then sees the numbers as they were when you made it. This cannot be undone.',
    nowSnapshot: 'This link is now a snapshot. It shows the numbers as they were when you made it.',
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
    pendingText = 'Creating link…',
}: {
    value: string;
    code?: boolean;
    pending?: boolean;
    pendingText?: string;
}) => {
    const { copied, copy } = useCopied();

    return (
        <div
            className={classNames(styles.box, code && styles.boxCode, pending && styles.boxPending)}
        >
            <span className={styles.boxText}>{pending ? pendingText : value}</span>
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

const ShareModal = ({
    open,
    onOpenChange,
    scope,
    title,
    data,
    offerLive,
    createShare,
    owned,
}: ShareModalProps) => {
    const [tab, setTab] = useState<string>(scope.kind === 'whole' ? 'conversation' : 'link');
    const [mode, setMode] = useState<ShareMode>('live');
    // The links of this opening, by kind, card, and mode (`shareLinkKey`).
    // A key with no entry is being made.
    const [links, setLinks] = useState<Record<string, ShareLink>>({});
    // A live link's switch to a snapshot, by key. The value is 'busy' while
    // it runs and 'failed' when it fails.
    const [switching, setSwitching] = useState<Record<string, 'busy' | 'failed'>>({});
    // The Data tab's file choice, shared by every card's Download.
    const [format, setFormat] = useState<DatasetFormat>('csv');
    const [bundle, setBundle] = useState(true);

    // Which share kind the current tab needs (Data needs none).
    const cardId = scope.kind === 'card' ? scope.id : undefined;
    const kind: StudioShareKind | null =
        scope.kind === 'card'
            ? 'card'
            : tab === 'conversation'
              ? 'conversation'
              : tab === 'canvas'
                ? 'canvas'
                : null;
    const { choice: hasMode, mode: linkMode } = shareModeFor(offerLive, kind, mode);
    const key = kind ? shareLinkKey(kind, cardId, linkMode) : null;
    const link = key ? links[key] : undefined;
    const id = link?.status === 'ready' ? link.id : undefined;
    const failed = link?.status === 'failed';
    const withdrawal = link?.status === 'withdrawn' ? link.withdrawal : null;

    // Keys whose link is being made (a ref: no render churn, no double POST).
    const requestedRef = useRef<Set<string>>(new Set());

    // Make the link for the active tab and mode once the dialog is open.
    useEffect(() => {
        if (!open || !key || !kind || key in links || requestedRef.current.has(key)) {
            return;
        }

        requestedRef.current.add(key);
        void openShareLink(
            { createShare, live: browserLiveDeps },
            { kind, cardId, mode: linkMode },
            (next) => setLinks((prev) => ({ ...prev, [key]: next })),
        ).finally(() => requestedRef.current.delete(key));
    }, [open, key, kind, cardId, linkMode, links, createShare]);

    // A link that failed is made again on "Try again" and on coming back to
    // its tab or mode.
    const retryFailed = () =>
        setLinks((prev) =>
            Object.fromEntries(
                Object.entries(prev).filter(([, other]) => other.status !== 'failed'),
            ),
        );

    const switchTab = (next: string) => {
        setTab(next);
        retryFailed();
    };

    const switchMode = (next: ShareMode) => {
        setMode(next);
        retryFailed();
    };

    const makeSnapshot = async () => {
        if (!key || !id) {
            return;
        }

        setSwitching((prev) => ({ ...prev, [key]: 'busy' }));

        if (await snapshotShare(browserLiveDeps.fetch, id)) {
            setLinks((prev) => ({
                ...prev,
                [key]: { status: 'ready', id, mode: 'snapshot', unchecked: 0 },
            }));
        } else {
            setSwitching((prev) => ({ ...prev, [key]: 'failed' }));
        }
    };

    const tabs = scope.kind === 'whole' ? WHOLE_TABS : CARD_TABS;
    const embedTitle = scope.kind === 'card' ? scope.title : title;
    const checking = link?.status === 'checking';
    const pending = !!key && (!link || checking);
    const showLink = scope.kind === 'whole' ? tab !== 'data' : tab === 'link';
    const showEmbed = scope.kind === 'whole' ? tab === 'canvas' : tab === 'embed';
    // A live link made a snapshot keeps its tab and reads as a snapshot.
    const shownMode: ShareMode = link?.status === 'ready' ? link.mode : linkMode;
    const canSwitch = owned && hasMode && link?.status === 'ready' && link.mode === 'live';
    const switchState = key ? switching[key] : undefined;
    const status = !hasMode
        ? null
        : checking
          ? checkingText(link.checked, link.total)
          : withdrawal
            ? withdrawalText(withdrawal, scope.kind === 'card')
            : link?.status === 'ready'
              ? linkMode === 'live' && link.mode === 'snapshot'
                  ? COPY.nowSnapshot
                  : uncheckedText(link.unchecked)
              : null;
    const pendingText = checking ? 'Checking cards…' : undefined;

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
                        {hasMode && (
                            <div className={styles.tabs}>
                                <SegmentedTabs
                                    tabs={MODE_TABS}
                                    value={mode}
                                    onChange={(next) => switchMode(next as ShareMode)}
                                />
                            </div>
                        )}
                        <p className={styles.copyText}>
                            {scope.kind === 'card'
                                ? tab === 'embed'
                                    ? COPY.embedCard[shownMode]
                                    : COPY.card[shownMode]
                                : tab === 'canvas'
                                  ? COPY.canvas[shownMode]
                                  : COPY.conversation}
                        </p>
                        {offerLive && kind === 'conversation' && (
                            <p className={styles.note}>{COPY.conversationOnly}</p>
                        )}
                        {/* Always present where a link can be live, so a
                            screen reader hears each line as it arrives. */}
                        {hasMode && (
                            <p className={styles.status} role="status">
                                {status}
                            </p>
                        )}
                        {failed && (
                            <>
                                <p className={styles.error} role="alert">
                                    Couldn&apos;t create the link — try again.
                                </p>
                                <div className={styles.actions}>
                                    <Button variant="bordered" small onClick={retryFailed}>
                                        Try again
                                    </Button>
                                </div>
                            </>
                        )}
                        {withdrawal && (
                            <div className={styles.actions}>
                                <Button
                                    variant="bordered"
                                    small
                                    onClick={() => switchMode('snapshot')}
                                >
                                    Share a snapshot instead
                                </Button>
                            </div>
                        )}
                        {showLink && !withdrawal && (
                            <CopyBox
                                value={id ? shareUrl(id) : ''}
                                pending={pending && !failed}
                                pendingText={pendingText}
                            />
                        )}
                        {showEmbed && !withdrawal && (
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
                                    pendingText={pendingText}
                                />
                            </>
                        )}
                        {canSwitch && (
                            <>
                                <hr className={styles.rule} />
                                <p className={styles.copyText}>{COPY.toSnapshot}</p>
                                {switchState === 'failed' && (
                                    <p className={styles.error} role="alert">
                                        Couldn&apos;t switch the link. Try again.
                                    </p>
                                )}
                                <div className={styles.actions}>
                                    <Button
                                        variant="bordered"
                                        small
                                        onClick={makeSnapshot}
                                        disabled={switchState === 'busy'}
                                    >
                                        {switchState === 'busy'
                                            ? 'Switching…'
                                            : 'Make this link a snapshot'}
                                    </Button>
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>
        </Modal>
    );
};

export default ShareModal;
