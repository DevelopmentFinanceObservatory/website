'use client';

import classNames from 'classnames';
import { useEffect, useRef, useState } from 'react';

import styles from './EmbedView.module.scss';

import CardBody from '@/components/organisms/Studio/canvas/cards/CardBody';
import type { CardExtras } from '@/components/organisms/Studio/canvas/cards/types';
import { resolveCardView, widgetTitle } from '@/components/organisms/Studio/canvas/layout';
import LiveNote from '@/components/organisms/Studio/canvas/LiveNote';
import Whiteboard from '@/components/organisms/Studio/canvas/Whiteboard';
import { useLiveCards } from '@/components/organisms/Studio/hooks/useLiveCards';
import CardInfoPanel from '@/components/organisms/Studio/modals/CardInfoPanel';
import { GRID_CELL } from '@/components/atoms/GridPattern/GridPattern';
import { useGridCell } from '@/hooks/useGridCell';
import { savedCanvasWidgetsOf } from '@/lib/chat/canvas';
import type { SavedConversation } from '@/lib/chat/history';
import type { Widget } from '@/lib/chat/widgets';
import { sharedCardAddress } from '@/lib/studio/cardDownload';
import { liveDataThrough } from '@/lib/studio/dataThrough';
import {
    embedHeightMessage,
    embedHeightToSend,
    isEmbedHeightRequest,
    naturalEmbedHeight,
} from '@/lib/studio/embedHeight';
import { logRefusedDescriptions } from '@/lib/studio/infoPanel';
import { cardLiveOf, isLiveCanvas, type LiveCanvas, type SharedView } from '@/lib/studio/liveCards';
import { deriveTheme, DEFAULT_THEME, type ThemeDerived, themeVars } from '@/lib/studio/theme';

const noop = () => undefined;

// The bottom edge of the root's content, read with nothing stretching it to
// the frame. Each child's min-height is lifted (the whiteboard and a text
// card fill the frame otherwise), and with `liftHeight` its height too, for
// a table card, which fills its frame and scrolls the rows it cannot show. A
// chart or key number card draws to the frame it gets and has no height of
// its own, so its height stays. The styles are put back before the browser
// paints. The root is each child's offset parent. A fixed child (the live
// strip) sits outside the scroll and is left out.
const contentBottom = (root: HTMLElement, liftHeight: boolean): number => {
    let bottom = 0;

    for (const child of root.children) {
        if (!(child instanceof HTMLElement) || getComputedStyle(child).position === 'fixed') {
            continue;
        }

        const { minHeight, height } = child.style;

        child.style.minHeight = '0px';

        if (liftHeight) {
            child.style.height = 'auto';
        }

        // Layout sizes, since a card's entry animation moves and scales its
        // box: its used height, fractional where offsetHeight rounds.
        bottom = Math.max(
            bottom,
            child.offsetTop + (parseFloat(getComputedStyle(child).height) || 0),
        );
        child.style.minHeight = minHeight;
        child.style.height = height;
    }

    return bottom;
};

// Inside a frame, tells the host page the height the content takes
// (lib/studio/embedHeight): when the frame or what it holds changes size, and
// when the host asks. The message carries one number and goes to any origin,
// since any site may frame a share and the height says nothing private.
const useReportHeight = (rootRef: React.RefObject<HTMLDivElement | null>, liftHeight: boolean) => {
    useEffect(() => {
        const root = rootRef.current;

        if (!root || window.parent === window) {
            return undefined;
        }

        let sent: number | null = null;
        const post = (height: number) => {
            sent = height;
            window.parent.postMessage(embedHeightMessage(height), '*');
        };
        const report = () => {
            const height = embedHeightToSend({
                natural: naturalEmbedHeight({
                    contentBottom: contentBottom(root, liftHeight),
                    clientHeight: root.clientHeight,
                    viewportHeight: window.innerHeight,
                }),
                viewportHeight: window.innerHeight,
                sent,
            });

            // The measure's own style writes are not changes to measure.
            changed.takeRecords();

            if (height !== null) {
                post(height);
            }
        };
        // A host that mounts after the embed has posted asks again.
        const onRequest = (event: MessageEvent) => {
            if (event.source !== window.parent || !isEmbedHeightRequest(event.data)) {
                return;
            }

            if (sent === null) {
                report();
            } else {
                post(sent);
            }
        };
        // One measure a frame, after whatever changed has laid out.
        let frame = 0;
        const schedule = () => {
            frame ||= requestAnimationFrame(() => {
                frame = 0;
                report();
            });
        };
        const resized = new ResizeObserver(schedule);
        const observeAll = () => {
            resized.disconnect();
            resized.observe(root);

            for (const child of root.children) {
                resized.observe(child);
            }
        };
        // The card or the sheet can mount after the frame does. A child held
        // at the frame's height by its min-height keeps its box when its
        // content shrinks, so an inline style change on a root child (the
        // whiteboard's height) also measures. Style changes deeper down, such
        // as chart tooltips and animations, cannot move a root child's bottom
        // and are ignored.
        const changed = new MutationObserver((records) => {
            const relevant = records.filter(
                (record) =>
                    record.type === 'childList' ||
                    (record.target instanceof Element && record.target.parentElement === root),
            );

            if (relevant.length === 0) {
                return;
            }

            if (relevant.some((record) => record.type === 'childList' && record.target === root)) {
                observeAll();
            }

            schedule();
        });

        observeAll();
        changed.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style'],
        });
        window.addEventListener('message', onRequest);

        return () => {
            resized.disconnect();
            changed.disconnect();
            cancelAnimationFrame(frame);
            window.removeEventListener('message', onRequest);
        };
    }, [rootRef, liftHeight]);
};

// The live strip's height, in CSS pixels, while it is drawn: one line on a
// wide frame and more where the line wraps. The root gives up that height at
// its foot (`--note-strip`), so the strip covers no card and the height the
// embed reports holds the strip. Null until the strip is measured.
const useNoteStripHeight = (
    rootRef: React.RefObject<HTMLDivElement | null>,
    noted: boolean,
): number | null => {
    const [height, setHeight] = useState<number | null>(null);

    useEffect(() => {
        const strip = noted ? rootRef.current?.querySelector('[data-live-note]') : null;

        if (!strip) {
            return undefined;
        }

        const measured = new ResizeObserver(([entry]) => {
            const box = entry?.borderBoxSize[0];

            if (box) {
                setHeight(box.blockSize);
            }
        });

        measured.observe(strip);

        return () => measured.disconnect();
    }, [rootRef, noted]);

    return noted ? height : null;
};

// A one-card share: the card alone, filling the iframe. Read-only — no pin,
// no menu; the legend, tooltips and the source line still work.
const SingleCard = ({
    widget,
    saved,
    theme,
    onCardInfo,
    live,
}: {
    widget: Widget;
    saved: SavedConversation;
    theme: ThemeDerived;
    onCardInfo: (id: string) => void;
    live: LiveCanvas | undefined;
}) => {
    // Chart.js px ride the same fluid factor as on the whiteboard.
    const scale = useGridCell() / GRID_CELL;
    const isText = widget.kind === 'text';
    const { view, choices, chartSource } = resolveCardView(widget, saved.views?.[widget.id]);
    const extras: CardExtras = {
        pinned: saved.pinnedIds.includes(widget.id),
        title: saved.titles?.[widget.id] ?? widgetTitle(widget),
        view,
        viewChoices: choices,
        onPin: noop,
        onRemove: noop,
        onAsk: noop,
        onInfo: isText ? null : () => onCardInfo(widget.id),
        onDownload: null,
        onDownloadImage: null,
        onEdit: noop,
        editLabel: isText ? 'Edit Card' : 'Edit Title',
        note: isText ? undefined : saved.notes?.[widget.id],
        onNote: null,
        onRemoveNote: null,
        onView: noop,
        onShare: null,
        readOnly: true,
        live: cardLiveOf(live, widget.id),
    };

    return (
        <CardBody
            widget={widget}
            view={view}
            chartSource={chartSource}
            scale={scale}
            theme={theme}
            // A text card's fit-to-content only sizes a whiteboard slot;
            // here the card grows by CSS and the frame scrolls (.singleText).
            widthCells={saved.layout?.[widget.id]?.w ?? 0}
            onFit={noop}
            ratio={saved.ratios?.[widget.id]}
            extras={extras}
        />
    );
};

/**
 * The embeddable view (/embed/<id>), in the theme it was shared with. A card
 * share is that one card filling the frame; a canvas or conversation share
 * is the whiteboard alone, read-only, with the cards its canvas shows
 * (`savedCanvasWidgetsOf`, as on /s/<id>) laid out as saved (panning and card
 * tooltips work; nothing can be changed). Either way a card's
 * source line opens its More Info panel. A live share's data cards arrive
 * held and are filled here from the refresh route (see useLiveCards), and
 * the frame says once that its data is live, the period it runs through and
 * when its text was written, on a strip under the sheet or the one card. The
 * period is read from the cards filled so far, one for a card and the
 * earliest and latest for a canvas.
 */
const EmbedView = ({ shared }: { shared: SharedView }) => {
    const { kind, saved } = shared;

    useEffect(() => {
        logRefusedDescriptions(saved.widgets);
    }, [saved]);

    const theme = deriveTheme(saved.theme ?? DEFAULT_THEME);
    const flyToCardRef = useRef<((id: string) => void) | null>(null);
    const [infoCardId, setInfoCardId] = useState<string | null>(null);
    const { widgets, live } = useLiveCards(shared, savedCanvasWidgetsOf(saved));
    const infoWidget = widgets.find((widget) => widget.id === infoCardId) ?? null;
    const single = kind === 'card' ? widgets[0] : undefined;
    const noted = isLiveCanvas(live);
    const dataThrough = noted ? liveDataThrough(widgets, live) : null;
    const rootRef = useRef<HTMLDivElement>(null);

    const stripHeight = useNoteStripHeight(rootRef, noted);

    useReportHeight(rootRef, single?.kind === 'table');

    return (
        <div
            ref={rootRef}
            className={classNames(
                kind === 'card' ? styles.single : styles.sheet,
                kind === 'card' && single?.kind === 'text' && styles.singleText,
                noted && styles.live,
            )}
            style={
                {
                    ...themeVars(theme),
                    ...(stripHeight === null ? {} : { '--note-strip': `${stripHeight}px` }),
                } as React.CSSProperties
            }
        >
            {kind === 'card' ? (
                single && (
                    <SingleCard
                        widget={single}
                        saved={saved}
                        theme={theme}
                        onCardInfo={setInfoCardId}
                        live={live}
                    />
                )
            ) : (
                <Whiteboard
                    widgets={widgets}
                    pinnedIds={saved.pinnedIds}
                    onTogglePin={noop}
                    onRemove={noop}
                    onAskFollowUp={noop}
                    onEditText={noop}
                    onEditTitle={noop}
                    titles={saved.titles ?? {}}
                    notes={saved.notes ?? {}}
                    onEditNote={noop}
                    onRemoveNote={noop}
                    initialLayout={saved.layout}
                    flyToCardRef={flyToCardRef}
                    theme={theme}
                    views={saved.views ?? {}}
                    onViewChange={noop}
                    ratios={saved.ratios ?? {}}
                    onRatioChange={noop}
                    onCardInfo={setInfoCardId}
                    focusedId={infoCardId}
                    readOnly
                    live={live}
                />
            )}

            {noted && (
                <LiveNote live={live} dataThrough={dataThrough} className={styles.noteStrip} />
            )}

            <CardInfoPanel
                info={infoWidget?.info ?? null}
                widget={infoWidget}
                open={infoCardId !== null}
                onOpenChange={(next) => !next && setInfoCardId(null)}
                shared={infoWidget && sharedCardAddress(shared, infoWidget.id)}
                snapshot={
                    shared.live
                        ? undefined
                        : {
                              id: shared.id,
                              servedAt: infoWidget ? shared.servedAt[infoWidget.id] : undefined,
                          }
                }
            />
        </div>
    );
};

export default EmbedView;
