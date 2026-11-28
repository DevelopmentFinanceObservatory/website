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
import { cardImageName, downloadCardImage } from '@/lib/studio/cardImage';
import { liveDataThrough } from '@/lib/studio/dataThrough';
import {
    embedHeightMessage,
    embedHeightToSend,
    isEmbedHeightRequest,
    naturalEmbedHeight,
} from '@/lib/studio/embedHeight';
import {
    type EmbedFoot,
    embedFootMessage,
    embedImageResult,
    isEmbedImageRequest,
} from '@/lib/studio/embedHost';
import { logRefusedDescriptions } from '@/lib/studio/infoPanel';
import {
    cardLiveOf,
    isLiveCanvas,
    type LiveCanvas,
    liveNote,
    type SharedView,
} from '@/lib/studio/liveCards';
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

// On a page of the site that draws the embed's foot (lib/studio/embedHost):
// tells it the foot whenever the foot changes and when it asks for the
// height, and writes the card's PNG when it asks for the picture. The card
// is the root's one `article`. Messages go to, and come only from, a parent
// on the site's own origin.
const useHostFoot = ({
    enabled,
    rootRef,
    foot,
    title,
}: {
    enabled: boolean;
    rootRef: React.RefObject<HTMLDivElement | null>;
    foot: EmbedFoot;
    title: string;
}) => {
    const { note, image } = foot;

    useEffect(() => {
        if (!enabled || window.parent === window) {
            return undefined;
        }

        const origin = window.location.origin;
        const post = (message: unknown) => window.parent.postMessage(message, origin);
        const photograph = async () => {
            const node = rootRef.current?.querySelector('article');

            if (!image || !node) {
                return false;
            }

            try {
                await downloadCardImage(node, cardImageName(title));

                return true;
            } catch (error) {
                console.error('embed: the card image could not be written', error);

                return false;
            }
        };
        const onMessage = (event: MessageEvent) => {
            if (event.source !== window.parent || event.origin !== origin) {
                return;
            }

            if (isEmbedHeightRequest(event.data)) {
                post(embedFootMessage({ note, image }));
            } else if (isEmbedImageRequest(event.data)) {
                void photograph().then((ok) => post(embedImageResult(ok)));
            }
        };

        post(embedFootMessage({ note, image }));
        window.addEventListener('message', onMessage);

        return () => window.removeEventListener('message', onMessage);
    }, [enabled, rootRef, note, image, title]);
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
 *
 * With `footHost` a page of the site frames the embed and draws that line
 * itself, beside Download image for a one-card share (useHostFoot), so the
 * frame leaves out the strip.
 */
const EmbedView = ({ shared, footHost = false }: { shared: SharedView; footHost?: boolean }) => {
    const { kind, saved } = shared;

    useEffect(() => {
        logRefusedDescriptions(saved.widgets);
    }, [saved]);

    const theme = deriveTheme(saved.theme ?? DEFAULT_THEME);
    const flyToCardRef = useRef<((id: string) => void) | null>(null);
    const [infoCardId, setInfoCardId] = useState<string | null>(null);
    const { widgets, live } = useLiveCards(shared, savedCanvasWidgetsOf(saved));
    const rootRef = useRef<HTMLDivElement>(null);
    const infoWidget = widgets.find((widget) => widget.id === infoCardId) ?? null;
    // The card whose panel was last opened. On a canvas the card is drawn
    // over the dim while its panel is open and back on the board after, so
    // the source line that opened the panel is a new element by then.
    const lastInfoIdRef = useRef<string | null>(null);
    const openInfo = (id: string) => {
        lastInfoIdRef.current = id;
        setInfoCardId(id);
    };
    const sourceLineOf = () => {
        const id = lastInfoIdRef.current;

        return id
            ? rootRef.current?.querySelector<HTMLElement>(
                  `[data-card-id="${CSS.escape(id)}"] button[title="More Info"]`,
              )
            : null;
    };
    const single = kind === 'card' ? widgets[0] : undefined;
    const noted = isLiveCanvas(live);
    const dataThrough = noted ? liveDataThrough(widgets, live) : null;
    const strip = noted && !footHost;
    const singleState = single && cardLiveOf(live, single.id)?.state;

    useReportHeight(rootRef, single?.kind === 'table');
    useHostFoot({
        enabled: footHost,
        rootRef,
        foot: {
            note: noted ? liveNote(live.createdAt, dataThrough) : null,
            // A live card is photographed once its data has arrived.
            image: single !== undefined && (!singleState || singleState.status === 'ready'),
        },
        title: single ? (saved.titles?.[single.id] ?? widgetTitle(single)) : '',
    });

    return (
        <div
            ref={rootRef}
            className={classNames(
                kind === 'card' ? styles.single : styles.sheet,
                kind === 'card' && single?.kind === 'text' && styles.singleText,
                strip && styles.live,
            )}
            style={themeVars(theme) as React.CSSProperties}
        >
            {kind === 'card' ? (
                single && (
                    <SingleCard
                        widget={single}
                        saved={saved}
                        theme={theme}
                        onCardInfo={openInfo}
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
                    onCardInfo={openInfo}
                    focusedId={infoCardId}
                    readOnly
                    live={live}
                />
            )}

            {strip && (
                <LiveNote live={live} dataThrough={dataThrough} className={styles.noteStrip} />
            )}

            <CardInfoPanel
                info={infoWidget?.info ?? null}
                widget={infoWidget}
                open={infoCardId !== null}
                autoFocus
                returnFocus={sourceLineOf}
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
