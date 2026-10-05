'use client';

import classNames from 'classnames';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import styles from './HistoryScreen.module.scss';
// The landing's stage (eyebrow / title / lead) and its drifting tiles — the
// history page is another Studio surface, so it reads the same.
import canvas from '@/components/organisms/Studio/Studio.module.scss';
import landing from '@/components/organisms/Studio/landing/StudioLanding.module.scss';
import prompt from '@/components/organisms/Studio/prompt/PromptForm.module.scss';

import Button from '@/components/atoms/Button/Button';
import GridPattern, { GRID_CELL } from '@/components/atoms/GridPattern/GridPattern';
import Icon from '@/components/atoms/Icon/Icon';
import Spinner from '@/components/atoms/Spinner/Spinner';
import Modal from '@/components/molecules/Modal/Modal';
import Header from '@/components/organisms/Header/Header';
import { useGridCell } from '@/hooks/useGridCell';
import { useGridFills } from '@/hooks/useGridFills';
import { revealIndex, useReveal } from '@/hooks/useReveal';
import { ConversationMeta, fetchHistory, removeConversation } from '@/lib/chat/historyClient';

// Light-canvas cell tints (the landing's — hardcoded hex by the canvas-layer
// convention).
const FILL_SHADES = ['#ffffff', '#eceada', '#dedcc6', '#cfceb6'];

const PAGE_SIZE = 5;

const formatDate = (ms: number) =>
    new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * My History (/history): every conversation saved to the account, newest
 * first — open one in the Studio (its own URL) or remove it (confirmed in
 * the house panel).
 */
const HistoryScreen = () => {
    const sectionRef = useReveal<HTMLElement>();
    const router = useRouter();
    const gridCell = useGridCell();
    const gridScale = gridCell / GRID_CELL;
    const fills = useGridFills({ shades: FILL_SHADES, cols: 96, rows: 54 });
    const [items, setItems] = useState<ConversationMeta[] | null>(null);
    // Bumped with every result set: keys the list so its rows remount and
    // play their entrance again.
    const [listSeq, setListSeq] = useState(0);
    // Five per page; a new result set starts on the first.
    const [page, setPage] = useState(0);
    // The search box: title + transcript, server-side, debounced.
    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    // The conversation the Remove dialog is about (the house panel); the
    // dialog stays mounted through its close animation, keyed per opening.
    const [confirming, setConfirming] = useState<ConversationMeta | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmSeq, setConfirmSeq] = useState(0);
    const [removing, setRemoving] = useState<string | null>(null);

    // Fetch on mount and again whenever the query settles (300ms after the
    // last keystroke); a stale response never overwrites a newer one.
    useEffect(() => {
        let active = true;
        const q = query.trim();
        const timer = window.setTimeout(
            () => {
                fetchHistory(q || undefined).then((list) => {
                    if (active) {
                        setItems(list);
                        setListSeq((n) => n + 1);
                        setPage(0);
                        setSearching(false);
                    }
                });
            },
            q ? 300 : 0,
        );

        return () => {
            active = false;
            window.clearTimeout(timer);
        };
    }, [query]);

    const onQuery = (value: string) => {
        setQuery(value);
        setSearching(true);
    };

    const askRemove = (item: ConversationMeta) => {
        setConfirming(item);
        setConfirmSeq((n) => n + 1);
        setConfirmOpen(true);
    };

    const remove = async () => {
        const id = confirming?.id;

        if (!id) {
            return;
        }

        setConfirmOpen(false);
        setRemoving(id);

        const ok = await removeConversation(id);

        setRemoving(null);

        if (ok) {
            setItems((prev) => (prev ? prev.filter((item) => item.id !== id) : prev));
        }
    };

    const pageSize = PAGE_SIZE;
    const pageCount = items ? Math.max(1, Math.ceil(items.length / pageSize)) : 1;
    const safePage = Math.min(page, pageCount - 1);
    const pageItems = items ? items.slice(safePage * pageSize, safePage * pageSize + pageSize) : [];

    return (
        <section ref={sectionRef} className={styles.section}>
            <div className={styles.canvas} aria-hidden="true">
                <GridPattern variant="light" cell={gridCell} />
                {fills.map(({ id, x, y, w, h, shade, leaving }) => (
                    <span
                        key={id}
                        className={classNames(canvas.fill, leaving && canvas.fillOut)}
                        style={{
                            left: x * gridScale,
                            top: y * gridScale,
                            width: w * gridScale,
                            height: h * gridScale,
                            backgroundColor: shade,
                        }}
                    />
                ))}
            </div>

            <div className={styles.bar}>
                <Header variant="studio" title="My History" fixed>
                    <Button
                        variant="dark"
                        wide
                        icon="arrow-up-right"
                        onClick={() => router.push('/studio')}
                    >
                        Open Studio
                    </Button>
                </Header>
            </div>

            <div className={classNames(landing.stage, styles.stage)}>
                <p className={landing.eyebrow} data-reveal="text">
                    DFO Studio
                </p>
                <h1
                    className={classNames(landing.title, styles.title)}
                    data-reveal="text"
                    style={revealIndex(1)}
                >
                    My History
                </h1>
                <p
                    className={classNames(landing.lead, styles.lead)}
                    data-reveal="text"
                    style={revealIndex(2)}
                >
                    Every canvas saved to your account, newest first — pick up where you left off.
                </p>

                <div className={styles.list}>
                    {/* The landing prompt's shell, as a search box (title + transcript). */}
                    <form
                        className={classNames(prompt.prompt, styles.search)}
                        role="search"
                        data-reveal
                        style={revealIndex(3)}
                        onSubmit={(event) => event.preventDefault()}
                    >
                        <input
                            className={prompt.promptInput}
                            type="search"
                            value={query}
                            onChange={(event) => onQuery(event.target.value)}
                            placeholder="Search titles and conversations…"
                            aria-label="Search titles and conversations"
                        />
                        {query ? (
                            <button
                                type="button"
                                className={styles.searchClear}
                                onClick={() => onQuery('')}
                                aria-label="Clear search"
                            >
                                <Icon name="closer" />
                            </button>
                        ) : (
                            <span className={styles.searchHint} aria-hidden>
                                <Icon name="search" />
                            </span>
                        )}
                    </form>

                    {items === null || searching ? (
                        // Reserves the five-row footprint, spinner in the middle —
                        // the list lands without a jump.
                        <div className={styles.loading}>
                            <Spinner size={22} />
                        </div>
                    ) : items.length === 0 && query.trim() ? (
                        <p className={styles.empty}>Nothing matches “{query.trim()}”.</p>
                    ) : items.length === 0 ? (
                        <div className={styles.emptyBox}>
                            <p className={styles.empty}>No canvases yet — start your first one.</p>
                            <Button
                                variant="dark"
                                icon="arrow"
                                wide
                                onClick={() => router.push('/studio')}
                            >
                                Open Studio
                            </Button>
                        </div>
                    ) : (
                        <ul className={styles.rows} key={`${listSeq}-${page}`}>
                            {pageItems.map((item, index) => (
                                <li
                                    key={item.id}
                                    className={classNames(
                                        styles.row,
                                        removing === item.id && styles.rowBusy,
                                    )}
                                    // Entrance stagger (CSS keyframes, --i).
                                    style={revealIndex(index)}
                                >
                                    <Link
                                        href={`/studio/${encodeURIComponent(item.id)}`}
                                        className={styles.rowMain}
                                    >
                                        <span className={styles.rowTitle}>{item.title}</span>
                                        <span className={styles.rowMeta}>
                                            {formatDate(item.updatedAt)} · {item.turnCount}{' '}
                                            {item.turnCount === 1 ? 'turn' : 'turns'}
                                        </span>
                                    </Link>
                                    <div className={styles.rowActions}>
                                        <Link
                                            href={`/studio/${encodeURIComponent(item.id)}`}
                                            className={styles.open}
                                            aria-label="Open in Studio"
                                        >
                                            <Icon name="arrow" />
                                        </Link>
                                        <button
                                            type="button"
                                            className={styles.remove}
                                            onClick={() => askRemove(item)}
                                            disabled={removing === item.id}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                    {items && !searching && pageCount > 1 && (
                        <div className={styles.pager}>
                            <Button
                                small
                                variant="bordered"
                                disabled={page === 0}
                                onClick={() => setPage((p) => Math.max(0, p - 1))}
                            >
                                Previous
                            </Button>
                            <span className={styles.pagerCount}>
                                {page + 1} / {pageCount}
                            </span>
                            <Button
                                small
                                variant="bordered"
                                disabled={page >= pageCount - 1}
                                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                            >
                                Next
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            <Modal
                key={`remove-${confirmSeq}`}
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title="Remove canvas"
                fit
            >
                <div className={styles.confirm}>
                    <p className={styles.confirmCopy}>
                        Remove <strong>{confirming?.title}</strong> from your history? The
                        conversation and its canvas are deleted; share links you already created
                        keep working (they&apos;re frozen copies).
                    </p>
                    <button type="button" className={styles.danger} onClick={remove}>
                        Remove canvas
                    </button>
                </div>
            </Modal>
        </section>
    );
};

export default HistoryScreen;
