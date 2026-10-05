'use client';

import classNames from 'classnames';
import { type MutableRefObject, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';

import BeaconLayer from './BeaconLayer';
import { computeBeacons } from './beacons';
import CardBody from './cards/CardBody';
import type { CardExtras } from './cards/types';
import {
    type CardView,
    effectiveKind,
    FILTER_KIND,
    GAP,
    resolveCardView,
    widgetTitle,
} from './layout';
import { useArrivals } from './useArrivals';
import { useBoardView } from './useBoardView';
import { DRAG_SLACK, useCardDrag } from './useCardDrag';
import { useCardResize } from './useCardResize';
import { useFilterFly } from './useFilterFly';
import { usePan } from './usePan';
import { useShockwave } from './useShockwave';
import { useSlots } from './useSlots';
import styles from './Whiteboard.module.scss';

import GridPattern, { GRID_CELL } from '@/components/atoms/GridPattern/GridPattern';
import { useGridCell } from '@/hooks/useGridCell';
import { useIsPhone } from '@/hooks/useMediaQuery';
import type { CardLayout } from '@/lib/chat/history';
import type { Widget } from '@/lib/chat/widgets';
import { cardRefOf } from '@/lib/studio/cardDownload';
import { type ThemeDerived, themeVars } from '@/lib/studio/theme';

export type WhiteboardProps = {
    widgets: Widget[];
    filter?: string;
    pinnedIds: string[];
    onTogglePin: (id: string) => void;
    onRemove: (id: string) => void;
    onAskFollowUp: (id: string, title: string) => void;
    // Opens one card's More Info panel.
    onCardInfo: (id: string) => void;
    // The card whose panel is open: it floats centred over the dimmed page.
    focusedId?: string | null;
    // Text cards edit through their modal (prefilled) — the parent owns it.
    onEditText: (id: string) => void;
    // Every other card renames through the Edit Title modal (parent-owned);
    // `titles` carries the renames.
    onEditTitle: (id: string) => void;
    titles: Record<string, string>;
    // User notes on data cards, by widget id (parent-owned, saved with the
    // conversation); the modal is the parent's too.
    notes: Record<string, string>;
    onEditNote: (id: string) => void;
    onRemoveNote: (id: string) => void;
    // A restored conversation's saved card rects — newcomers found here mount
    // straight into their old spot and size instead of auto-placing.
    initialLayout?: CardLayout;
    // Reports the live layout after every settle, for persistence.
    onLayoutChange?: (layout: CardLayout) => void;
    // Filled with a fly-to-card function for the parent (Activity → View on
    // whiteboard, chat chips).
    flyToCardRef?: MutableRefObject<((id: string) => void) | null>;
    // The resolved canvas theme (Customize) — Chart.js and the shockwave
    // need hex values, the SCSS reads the matching --th-* variables.
    theme: ThemeDerived;
    // Per-card visualisation picked in the kebab (owned by the parent, so
    // the filters/tabs see the effective kind and it persists).
    views: Record<string, CardView>;
    onViewChange: (id: string, view: CardView) => void;
    // Card menu → Share (link / embed of that one card).
    onShare?: (id: string) => void;
    // Card menu → Download Data (that card's rows).
    onDownload?: (id: string) => void;
    // A shared or embedded sheet: cards can't be moved, resized, pinned or
    // acted on — panning, tooltips and legends still work.
    readOnly?: boolean;
    // A one-card share: the card sits in the middle of the view (re-centred
    // as the view resizes) instead of at its saved spot, and the sheet is a
    // still — no shockwaves.
    centerSingle?: boolean;
};

/**
 * The whiteboard sheet: cards pinned to exact pattern cells, its own grid
 * layer scrolling along, drag-to-rearrange via the hover grab bar, corner
 * resize, background panning, off-screen beacons and the arrival
 * shockwave. The sheet hugs its content in both axes (plus slack while
 * dragging) — the viewport is just a window onto it.
 */
const Whiteboard = ({
    widgets,
    filter,
    pinnedIds,
    onTogglePin,
    onRemove,
    onAskFollowUp,
    onCardInfo,
    focusedId,
    onEditText,
    onEditTitle,
    titles,
    notes,
    onEditNote,
    onRemoveNote,
    initialLayout,
    onLayoutChange,
    flyToCardRef,
    theme,
    views,
    onViewChange,
    onShare,
    onDownload,
    readOnly = false,
    centerSingle = false,
}: WhiteboardProps) => {
    // Fluid cell: GRID_CELL scaled by the live root font-size. All cell↔px
    // math uses it; `f` scales the raw-px interaction constants (scroll
    // zones, beacon spacing, chart fonts) by the same factor.
    const CELL = useGridCell();
    const f = CELL / GRID_CELL;
    const boardRef = useRef<HTMLDivElement>(null);
    // On a phone the panel covers the sheet anyway, so the card stays put.
    const isPhone = useIsPhone();
    const { view, origin, viewCols } = useBoardView(boardRef, CELL);
    // The layout is in cells, so it's the SAME arrangement on every screen —
    // on a phone the cells are just smaller (useGridCell fits them to the
    // width) and the sheet pans.
    const { slots, setSlots, fitRows, raise } = useSlots({
        widgets,
        pinnedIds,
        initialLayout,
        viewCols,
        onLayoutChange,
    });
    const widgetIds = useMemo(() => new Set(widgets.map((widget) => widget.id)), [widgets]);
    const dragging = useCardDrag({ boardRef, CELL, f, slots, setSlots, raise, widgetIds });
    const pan = usePan(boardRef);
    const { canvasRef: fxCanvasRef, spawnWave } = useShockwave({
        boardRef,
        CELL,
        f,
        origin,
        view,
        theme,
        enabled: !centerSingle,
    });

    const { drag, grab, dragged, swap, landing } = dragging;

    // The sheet hugs its content in both axes: it reaches to the outermost
    // card (and the live landing hint), plus slack cells while dragging so
    // there's always room to keep going. min-width/height:100% cover the
    // empty state — the view is never smaller than the window.
    const swapPartner = swap ? slots[swap.id] : undefined;
    const bottomRow = Math.max(
        0,
        ...Object.values(slots).map((slot) => slot.row + slot.h),
        landing && dragged ? landing.row + dragged.h : 0,
        swap && swapPartner ? swap.theirRow + swapPartner.h : 0,
    );
    const rightCol = Math.max(
        0,
        ...Object.values(slots).map((slot) => slot.col + slot.w),
        landing && dragged ? landing.col + dragged.w : 0,
        swap && swapPartner ? swap.theirCol + swapPartner.w : 0,
    );

    const resizing = useCardResize({
        boardRef,
        CELL,
        f,
        slots,
        setSlots,
        pinnedIds,
        extent: { rightCol, bottomRow },
    });

    useArrivals({
        boardRef,
        slots,
        origin,
        CELL,
        spawnWave,
        busy: () => dragging.isDragging() || pan.isPanning(),
    });

    useFilterFly({ boardRef, filter, slots, views, origin, view, CELL, stopGlide: pan.stopGlide });

    const flyTo = (cx: number, cy: number) => pan.flyTo(cx, cy, view.width, view.height);

    // Fly to a card by id (Activity's "View on whiteboard", the chat chips),
    // published to the parent through the ref.
    useEffect(() => {
        if (!flyToCardRef) {
            return;
        }

        flyToCardRef.current = (id: string) => {
            const slot = slots[id];

            if (!slot) {
                return;
            }

            flyTo(
                origin.x + (slot.col + slot.w / 2) * CELL,
                origin.y + (slot.row + slot.h / 2) * CELL,
            );
        };

        return () => {
            flyToCardRef.current = null;
        };
    });

    const titleOf = (widget: Widget) => titles[widget.id] ?? widgetTitle(widget);
    const dimKind = filter ? FILTER_KIND[filter] : undefined;
    const beacons = computeBeacons({ slots, view, origin, CELL, f, dimKind, views, titleOf });
    const liveCount = Object.values(slots).filter((other) => !other.leaving).length;

    return (
        <div
            ref={boardRef}
            className={classNames(styles.board, pan.panning && styles.boardPanning)}
            style={{
                width:
                    origin.x +
                    Math.max(rightCol + GAP + (drag ? DRAG_SLACK : 0), resizing.floor?.cols ?? 0) *
                        CELL,
                height:
                    origin.y +
                    Math.max(bottomRow + GAP + (drag ? DRAG_SLACK : 0), resizing.floor?.rows ?? 0) *
                        CELL,
            }}
            onPointerDown={pan.startPan}
            onPointerMove={pan.movePan}
            onPointerUp={pan.endPan}
            onPointerCancel={pan.endPan}
            // Test rig for the arrival shockwave: a plain click on the empty
            // sheet (no pan, no card, no interactive target) ripples from
            // wherever you clicked.
            onClick={(event) => {
                const target = event.target as HTMLElement;

                if (
                    pan.panMoved() ||
                    pan.panFromCard() ||
                    target.closest(
                        'article, button, a, input, textarea, select, [data-beacon], [data-nowave]',
                    )
                ) {
                    return;
                }

                const rect = event.currentTarget.getBoundingClientRect();

                spawnWave(
                    (event.clientX - rect.left - origin.x) / CELL,
                    (event.clientY - rect.top - origin.y) / CELL,
                );
            }}
        >
            <BeaconLayer beacons={beacons} onFly={flyTo} />

            <div
                className={styles.gridLayer}
                style={{ top: origin.y - CELL, left: origin.x - CELL }}
            >
                <GridPattern variant="light" cell={CELL} />
            </div>

            {/* The effects canvas — shockwaves draw here procedurally (one
                2D surface instead of hundreds of animated DOM cells). */}
            <div className={styles.fxLayer}>
                <canvas
                    ref={fxCanvasRef}
                    className={styles.fxCanvas}
                    style={{ width: view.width, height: view.height }}
                    aria-hidden="true"
                />
            </div>

            {/* The vacated slot stays visible as a ghost outline until the
                card is dropped (per the design). */}
            {dragged && (
                <span
                    className={styles.ghost}
                    style={{
                        left: origin.x + dragged.col * CELL,
                        top: origin.y + dragged.row * CELL,
                        width: dragged.w * CELL,
                        height: dragged.h * CELL,
                    }}
                />
            )}

            {/* Where the card will land on release — always present, riding
                the nearest spot that actually fits. */}
            {dragged && landing && (
                <span
                    className={styles.ghostTarget}
                    style={{
                        left: origin.x + landing.col * CELL,
                        top: origin.y + landing.row * CELL,
                        width: dragged.w * CELL,
                        height: dragged.h * CELL,
                    }}
                />
            )}

            {/* Slot-driven (not props-driven) so a replaced card keeps its DOM
                node through the leaving fade — each slot carries its widget. */}
            {Object.values(slots).map((slot) => {
                const { widget } = slot;
                const isLeaving = !!slot.leaving;
                const isDragged = drag?.id === widget.id;
                // The swap partner previews the trade live: it rides over to
                // its proposed landing (and back, if the drag moves on).
                const isSwapPartner = swap?.id === widget.id;
                // A one-card share shows the card in the middle of the view
                // (its saved spot meant something on the sharer's canvas, not
                // here) — a display position, the slot itself is untouched.
                const centred =
                    centerSingle && liveCount === 1 && view.width && view.height
                        ? {
                              col: Math.max(0, Math.floor((view.width / CELL - slot.w) / 2)),
                              row: Math.max(0, Math.floor((view.height / CELL - slot.h) / 2)),
                          }
                        : null;
                const col = centred
                    ? centred.col
                    : isSwapPartner && swap
                      ? swap.theirCol
                      : slot.col;
                const row = centred
                    ? centred.row
                    : isSwapPartner && swap
                      ? swap.theirRow
                      : slot.row;
                const title = titleOf(widget);
                const {
                    view: cardView,
                    choices,
                    chartSource,
                } = resolveCardView(widget, views[widget.id]);
                const isText = widget.kind === 'text';
                const dimmed = !!dimKind && effectiveKind(widget, views[widget.id]) !== dimKind;
                const extras: CardExtras = {
                    pinned: pinnedIds.includes(widget.id),
                    title,
                    view: cardView,
                    viewChoices: choices,
                    onPin: () => onTogglePin(widget.id),
                    onRemove: () => onRemove(widget.id),
                    onAsk: () => onAskFollowUp(widget.id, title),
                    onInfo: isText ? null : () => onCardInfo(widget.id),
                    onDownload:
                        onDownload && cardRefOf(widget) ? () => onDownload(widget.id) : null,
                    onEdit: isText ? () => onEditText(widget.id) : () => onEditTitle(widget.id),
                    editLabel: isText ? 'Edit Card' : 'Edit Title',
                    note: isText ? undefined : notes[widget.id],
                    onNote: isText ? null : () => onEditNote(widget.id),
                    onRemoveNote: isText ? null : () => onRemoveNote(widget.id),
                    onView: (next) => onViewChange(widget.id, next),
                    onShare: onShare && !readOnly ? () => onShare(widget.id) : null,
                    readOnly,
                };

                const focused = widget.id === focusedId && !isPhone;
                // A focused card is placed by the stylesheet (centred on the
                // window, over the dim), so the canvas' own coordinates, stack
                // order and drag offset all step aside; portalled out of the
                // canvas it also leaves the theme scope, so it carries it.
                const place: Record<string, string | number> = focused
                    ? themeVars(theme)
                    : {
                          left: origin.x + col * CELL,
                          top: origin.y + row * CELL,
                          zIndex: slot.z,
                          translate: isDragged && drag ? `${drag.dx}px ${drag.dy}px` : '0px 0px',
                      };
                const slotNode = (
                    <div
                        key={widget.id}
                        className={classNames(
                            styles.slot,
                            isDragged && styles.slotDragging,
                            isLeaving && styles.slotLeaving,
                            dimmed && styles.slotDimmed,
                            focused && styles.slotFocused,
                        )}
                        // The card's own module reads these (lift tint, inert
                        // when filtered out).
                        data-dragging={isDragged ? '' : undefined}
                        data-dimmed={dimmed ? '' : undefined}
                        style={
                            {
                                ...place,
                                width: slot.w * CELL,
                                height: slot.h * CELL,
                                '--tilt': isDragged && drag ? `${drag.tilt}deg` : '0deg',
                                ...(grab?.id === widget.id && {
                                    '--grab-x': `${grab.x}px`,
                                    '--grab-y': `${grab.y}px`,
                                }),
                            } as React.CSSProperties
                        }
                    >
                        {/* The box carries the lift transform (tilt + scale),
                            so the grab bar and the resize grip ride along with
                            the card instead of hanging off the static slot. */}
                        <div className={styles.cardBox}>
                            {/* Only a fading card has no grab bar — pinned ones
                                still drag fine (pin = safe from INCOMING widgets,
                                not from the user). */}
                            {!isLeaving && !readOnly && (
                                <span
                                    className={styles.handle}
                                    data-nowave=""
                                    onPointerDown={dragging.startDrag(widget.id)}
                                    onPointerMove={dragging.moveDrag}
                                    onPointerUp={dragging.endDrag(true)}
                                    onPointerCancel={dragging.endDrag(false)}
                                />
                            )}
                            {!isLeaving && !readOnly && !isText && (
                                <span
                                    className={styles.resizeGrip}
                                    data-nowave=""
                                    onPointerDown={resizing.startResize(widget.id)}
                                    onPointerMove={resizing.moveResize}
                                    onPointerUp={resizing.endResize}
                                    onPointerCancel={resizing.endResize}
                                >
                                    <svg viewBox="0 0 10 10" aria-hidden="true">
                                        <path d="M2.5 9 9 2.5M6 9 9 6" />
                                    </svg>
                                </span>
                            )}
                            <CardBody
                                widget={widget}
                                view={cardView}
                                chartSource={chartSource}
                                scale={f}
                                theme={theme}
                                widthCells={slot.w}
                                onFit={(rows) => fitRows(widget.id, rows)}
                                extras={extras}
                            />
                        </div>
                    </div>
                );

                // The canvas layer is panned with a transform, which makes
                // even `position: fixed` resolve against it — so the focused
                // card is hung off the body instead, next to the panel's own
                // portal, and centres on the window like the dim does.
                return focused ? createPortal(slotNode, document.body, widget.id) : slotNode;
            })}
        </div>
    );
};

export default Whiteboard;
