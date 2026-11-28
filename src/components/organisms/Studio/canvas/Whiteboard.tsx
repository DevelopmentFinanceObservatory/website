'use client';

import classNames from 'classnames';
import {
    type MutableRefObject,
    useEffect,
    useEffectEvent,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { createPortal } from 'react-dom';

import BeaconLayer from './BeaconLayer';
import { computeBeacons } from './beacons';
import {
    arrivalBlock,
    questionTurn,
    BLOCK_INSET,
    blockCols,
    type Placement,
    replyBlockTop,
    revealOffset,
} from './blocks';
import { scrollerOf, scrollView } from './board';
import { DRAG_THRESHOLD, selectionAfter, type SelectTarget, selectTarget } from './cardPress';
import CardBody from './cards/CardBody';
import type { CardExtras } from './cards/types';
import { type Coming, comingNotice, ghostLabel, RESEAT_MS, titledGhosts } from './comingGhosts';
import {
    type CardView,
    effectiveKind,
    FILTER_KIND,
    GAP,
    heightIsDerived,
    heightIsFree,
    gripRange,
    heightRange,
    type Rect,
    resolveCardView,
    widgetTitle,
} from './layout';
import { useArrivals } from './useArrivals';
import { useBoardView } from './useBoardView';
import { DRAG_SLACK, useCardDrag } from './useCardDrag';
import { useCardResize } from './useCardResize';
import { useFilterFly } from './useFilterFly';
import { usePan } from './usePan';
import { usePointing } from './usePointing';
import { useShockwave } from './useShockwave';
import { useSlots } from './useSlots';
import styles from './Whiteboard.module.scss';

import GridPattern, { GRID_CELL } from '@/components/atoms/GridPattern/GridPattern';
import { useGridCell } from '@/hooks/useGridCell';
import { useIsPhone } from '@/hooks/useMediaQuery';
import type { CardLayout } from '@/lib/chat/history';
import type { Widget } from '@/lib/chat/widgets';
import { cardRefOf } from '@/lib/studio/cardDownload';
import { cardImageName, cardNode, downloadCardImage } from '@/lib/studio/cardImage';
import { cardUnitOffer } from '@/lib/studio/cardUnit';
import { cardLiveOf, type LiveCanvas } from '@/lib/studio/liveCards';
import { type ThemeDerived, themeVars } from '@/lib/studio/theme';
import type { UnitChoice } from '@/lib/studio/wire';

// The held card is brought into view again once the session panel's width
// change has settled the canvas's width.
const HELD_SETTLE_MS = 320;

// The pause between emptying the status and filling it, so the same words
// twice are announced twice.
const NOTICE_GAP_MS = 60;

const scrollBehavior = (): ScrollBehavior =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

/**
 * What the Prompt layout adds to the canvas. Its presence puts each
 * question's cards in a block of their own below the earlier ones
 * (`placement: 'blocks'`, blocks.ts) and makes the canvas dock-aware: a
 * prompt floats over the canvas's foot, so the sheet runs on below its last
 * row by the prompt's height (--dock-rest, --dock-current on an ancestor),
 * and the bottom beacons and the arrival scroll keep clear of it.
 */
export type PromptCanvas = {
    // Px the session panel is about to take at the right. Fresh cards are
    // placed against the narrower width. 0 while the panel is open already.
    reserveRight: number;
    // The selected card, whose value the parent owns. With `onSelect` each
    // card is a toggle: a press on it away from its controls, or Enter or
    // Space, selects or clears it, and a press on the empty sheet clears.
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    // The card the session panel shows, outlined and brought into view.
    heldId: string | null;
    // Cards outlined faintly as the same plan's cards.
    litIds: readonly string[];
    // The card the pointer or keyboard focus rests on, after POINT_REST_MS.
    // Null at once when it leaves. Silent while a card menu is open.
    onPoint: (id: string | null) => void;
    // Cards a research plan made, whose menu opens with View Research Plan.
    viewPlanIds: ReadonlySet<string>;
    onViewPlan: (id: string) => void;
    // A question's turn is running. When it ends, the view brings the block
    // its cards landed in to one cell under the top.
    replying: boolean;
    // The cards the running turn has announced, drawn as placeholders where
    // they will land (comingGhosts.ts).
    coming: readonly Coming[];
};

export type WhiteboardProps = {
    widgets: Widget[];
    filter?: string;
    pinnedIds: string[];
    onTogglePin: (id: string) => void;
    onRemove: (id: string) => void;
    onAskFollowUp: (id: string, title: string) => void;
    // Card menu → Change unit → Send, on a card whose frame offers other
    // units. Absent on a sheet where no turn can run.
    onChangeUnit?: (id: string, unit: UnitChoice) => void;
    // Why card changes wait (changesHeld), which the Change unit row shows
    // in place of opening its panel. Null or absent when they can go.
    changesHeld?: string | null;
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
    // Cards that replaced another in its slot, new id → old id: each keeps
    // the old card's place and size.
    replacedIds?: Record<string, string>;
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
    // Per-card plot ratio set by dragging a chart card's height (owned by
    // the parent, so it persists and a share holds it).
    ratios: Record<string, number>;
    onRatioChange: (id: string, ratio: number) => void;
    // Card menu → Share (link / embed of that one card).
    onShare?: (id: string) => void;
    // Card download button → Download Data (that card's rows).
    onDownload?: (id: string) => void;
    // A shared or embedded sheet: cards can't be moved, resized, pinned or
    // acted on — panning, tooltips and legends still work.
    readOnly?: boolean;
    // A read-only sheet whose cards may still be resized (a share page):
    // the grip shows, and the sizes and ratios it sets are the viewer's
    // alone — a share has no conversation to save them to.
    resizable?: boolean;
    // A one-card share: the card sits in the middle of the view (re-centred
    // as the view resizes) instead of at its saved spot, and the sheet is a
    // still — no shockwaves.
    centerSingle?: boolean;
    // A live share's canvas: each data card's refresh state, handed to the
    // card with the share's id and creation time. Absent for a snapshot and
    // in the owner's Studio.
    live?: LiveCanvas;
    // The Prompt layout's canvas. Absent in the classic layout.
    prompt?: PromptCanvas;
};

/**
 * The whiteboard sheet: cards pinned to exact pattern cells, its own grid
 * layer scrolling along, drag-to-rearrange by a card's head row and frame,
 * corner resize, background panning, off-screen beacons and the arrival
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
    onChangeUnit,
    changesHeld = null,
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
    replacedIds,
    flyToCardRef,
    theme,
    views,
    onViewChange,
    ratios,
    onRatioChange,
    onShare,
    onDownload,
    readOnly = false,
    resizable = false,
    centerSingle = false,
    live,
    prompt,
}: WhiteboardProps) => {
    // Fluid cell: GRID_CELL scaled by the live root font-size. All cell↔px
    // math uses it; `f` scales the raw-px interaction constants (scroll
    // zones, beacon spacing, chart fonts) by the same factor.
    const dockAware = !!prompt;
    const placement: Placement = prompt ? 'blocks' : 'pack';
    const reserveRight = prompt?.reserveRight ?? 0;
    const selectedId = prompt?.selectedId ?? null;
    const onSelect = prompt?.onSelect;
    const heldId = prompt?.heldId ?? null;
    const litIds = prompt?.litIds;
    const onPoint = prompt?.onPoint;
    const viewPlanIds = prompt?.viewPlanIds;
    const onViewPlan = prompt?.onViewPlan;
    const replying = prompt?.replying;
    const coming = prompt?.coming;
    const CELL = useGridCell();
    const f = CELL / GRID_CELL;
    const boardRef = useRef<HTMLDivElement>(null);
    // On a phone the panel covers the sheet anyway, so the card stays put.
    const isPhone = useIsPhone();
    // Block placement measures its insets from the sheet's own frame, so its
    // grid starts at the frame's corner.
    const { view, origin, viewCols } = useBoardView(boardRef, CELL, placement !== 'blocks');
    // The layout is in cells, so it's the SAME arrangement on every screen —
    // on a phone the cells are just smaller (useGridCell fits them to the
    // width) and the sheet pans.
    const blocks = placement === 'blocks';
    const { slots, setSlots, ghosts, claimed, fitRows, raise } = useSlots({
        widgets,
        pinnedIds,
        views,
        initialLayout,
        viewCols: blocks ? blockCols(view.width, reserveRight, CELL) : viewCols,
        placement,
        onLayoutChange,
        replacedIds,
        coming,
    });
    const widgetIds = useMemo(() => new Set(widgets.map((widget) => widget.id)), [widgets]);
    // Download Image. The card is found in the document rather than held in
    // a ref: the button that asks for it is rendered inside the very card
    // being photographed, and the sheet already labels each slot with its
    // widget id.
    const saveCardImage = (id: string, title: string) => {
        const node = cardNode(id);

        if (!node) {
            return;
        }

        void downloadCardImage(node, cardImageName(title));
    };
    // The Prompt layout's canvas on a phone is one column that scrolls.
    const column = blocks && isPhone;
    const dragging = useCardDrag({
        boardRef,
        CELL,
        f,
        slots,
        setSlots,
        raise,
        widgetIds,
        column,
    });
    const pan = usePan(boardRef, column);
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
        ...Object.values(ghosts).map((ghost) => ghost.row + ghost.h),
        landing && dragged ? landing.row + dragged.h : 0,
        swap && swapPartner ? swap.theirRow + swapPartner.h : 0,
    );
    const rightCol = Math.max(
        0,
        ...Object.values(slots).map((slot) => slot.col + slot.w),
        ...Object.values(ghosts).map((ghost) => ghost.col + ghost.w),
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

    // The px of the view's foot the floating prompt covers: the height of
    // the sheet's foot probe, which the stylesheet sizes to --board-foot.
    const promptCover = (scroller: HTMLElement) =>
        dockAware
            ? (scroller.querySelector<HTMLElement>('[data-board-foot]')?.getBoundingClientRect()
                  .height ?? 0)
            : 0;

    // The scroll that shows a card whole, above the prompt; or its top, one
    // cell in, when it is taller than the room. `top` overrides the vertical.
    const revealRect = (
        rect: Rect,
        scroller: HTMLElement,
        top?: number,
    ): ScrollToOptions | null => {
        const left = revealOffset({
            start: origin.x + rect.col * CELL,
            end: origin.x + (rect.col + rect.w) * CELL,
            scroll: scroller.scrollLeft,
            size: scroller.clientWidth,
            lead: CELL,
        });
        const nextTop =
            top ??
            revealOffset({
                start: origin.y + rect.row * CELL,
                end: origin.y + (rect.row + rect.h) * CELL,
                scroll: scroller.scrollTop,
                size: scroller.clientHeight,
                hidden: promptCover(scroller),
                lead: CELL,
            });

        if (left === null && (nextTop === null || nextTop === scroller.scrollTop)) {
            return null;
        }

        pan.stopGlide();

        return {
            left: left ?? scroller.scrollLeft,
            top: nextTop ?? scroller.scrollTop,
            behavior: scrollBehavior(),
        };
    };

    useArrivals({
        boardRef,
        slots,
        origin,
        CELL,
        spawnWave,
        busy: () => dragging.isDragging() || pan.isPanning(),
        // On the Prompt canvas, a card seated in a placeholder's rect moves the
        // view no further, since it went to the placeholder.
        quiet: prompt ? (newest) => claimed.has(newest.widget.id) : undefined,
        // A new block comes up to one cell under the top; a card joining a
        // block is revealed just enough to show above the prompt.
        placeView: blocks
            ? (newest, fresh, scroller) => {
                  const block = arrivalBlock(newest, slots, fresh);

                  return revealRect(
                      newest,
                      scroller,
                      block.isNew
                          ? Math.max(0, origin.y + (block.top - BLOCK_INSET) * CELL)
                          : undefined,
                  );
              }
            : undefined,
    });

    // Placeholders that appear are announced once as a batch, and the view
    // goes to the first of them as it goes to a block's first card, once
    // their places have settled (comingGhosts.ts RESEAT_MS). The cards that
    // later take their places move nothing.
    const seenGhosts = useRef<Set<string>>(new Set());
    const showTimer = useRef(0);
    const noticeTimer = useRef(0);
    const waitingGhosts = useRef<Set<string>>(new Set());
    const [notice, setNotice] = useState('');
    const showGhosts = useEffectEvent(() => {
        const ids = waitingGhosts.current;
        const scroller = scrollerOf(boardRef);
        const fresh = Object.values(ghosts).filter((ghost) => ids.has(ghost.id) && !ghost.leaving);
        const first = fresh.toSorted((a, b) => a.row - b.row || a.col - b.col)[0];

        showTimer.current = 0;
        ids.clear();

        if (!blocks || !scroller || !first || dragging.isDragging() || pan.isPanning()) {
            return;
        }

        const own = Object.values(slots).some(
            (slot) => !slot.leaving && questionTurn(slot.widget) === first.turn,
        );
        const top = Math.min(...fresh.filter((g) => g.turn === first.turn).map((g) => g.row));
        const target = revealRect(
            first,
            scroller,
            own ? undefined : Math.max(0, origin.y + (top - BLOCK_INSET) * CELL),
        );

        if (target) {
            scrollView(scroller, target);
        }
    });

    useEffect(() => {
        const fresh = Object.values(ghosts).filter(
            (ghost) => !ghost.leaving && !seenGhosts.current.has(ghost.id),
        );

        for (const ghost of fresh) {
            seenGhosts.current.add(ghost.id);
            waitingGhosts.current.add(ghost.id);
        }

        if (fresh.length > 0) {
            // Emptied first, so a batch that reads like the last is heard again.
            const words = comingNotice(fresh);

            setNotice('');
            window.clearTimeout(noticeTimer.current);
            noticeTimer.current = window.setTimeout(() => setNotice(words), NOTICE_GAP_MS);
            window.clearTimeout(showTimer.current);
            showTimer.current = window.setTimeout(showGhosts, RESEAT_MS + 20);
        }
    }, [ghosts]);

    useEffect(
        () => () => {
            window.clearTimeout(showTimer.current);
            window.clearTimeout(noticeTimer.current);
        },
        [],
    );

    // The sheet's foot never shortens: the prompt's height falls as its reply
    // sheet folds, and a shorter sheet would clamp a scroll that has already
    // come to rest back by the difference. A new question and a resized window
    // start the hold again.
    const heldSheet = useRef(0);
    const footHold = useRef(0);
    const holdFoot = useEffectEvent((restart = false) => {
        const board = boardRef.current;
        const probe = board?.querySelector<HTMLElement>('[data-board-foot]');

        if (!board || !probe) {
            return;
        }

        const height = probe.getBoundingClientRect().height;

        footHold.current = restart ? height : Math.max(footHold.current, height);
        board.style.setProperty('--board-foot-held', `${footHold.current}px`);
    });

    useEffect(() => {
        const probe = boardRef.current?.querySelector<HTMLElement>('[data-board-foot]');

        if (!dockAware || !probe) {
            return undefined;
        }

        holdFoot();

        const watch = new ResizeObserver(() => holdFoot());
        // A window of another size starts the hold again.
        const resized = () => holdFoot(true);

        watch.observe(probe);
        window.addEventListener('resize', resized);

        return () => {
            watch.disconnect();
            window.removeEventListener('resize', resized);
        };
    }, [dockAware]);

    // The live cards when the running turn began, to tell which landed in it.
    const turnStart = useRef<ReadonlySet<string> | null>(null);
    const markTurn = useEffectEvent(() => {
        heldSheet.current = 0;
        holdFoot(true);
        turnStart.current = new Set(
            Object.entries(slots)
                .filter(([, slot]) => !slot.leaving)
                .map(([id]) => id),
        );
    });
    const showReply = useEffectEvent(() => {
        const before = turnStart.current;
        const scroller = scrollerOf(boardRef);

        turnStart.current = null;

        if (!before || !scroller || dragging.isDragging() || pan.isPanning()) {
            return;
        }

        const top = replyBlockTop(slots, before);

        if (top === null) {
            return;
        }

        pan.stopGlide();
        scrollView(scroller, {
            left: scroller.scrollLeft,
            top: Math.max(0, origin.y + (top - BLOCK_INSET) * CELL),
            behavior: scrollBehavior(),
        });
    });

    // The turn's last cards are placed a frame after they arrive (useSlots),
    // so the view moves two frames after the turn ends.
    useEffect(() => {
        if (replying === undefined) {
            return undefined;
        }

        if (replying) {
            markTurn();

            return undefined;
        }

        let inner = 0;
        const outer = requestAnimationFrame(() => {
            inner = requestAnimationFrame(() => showReply());
        });

        return () => {
            cancelAnimationFrame(outer);
            cancelAnimationFrame(inner);
        };
    }, [replying]);

    // The held card comes into view when it changes, and again once the
    // panel that holds it has changed the canvas's width.
    const revealHeld = useEffectEvent(() => {
        const slot = heldId ? slots[heldId] : undefined;
        const scroller = scrollerOf(boardRef);

        if (!slot || slot.leaving || !scroller) {
            return;
        }

        const target = revealRect(slot, scroller);

        if (target) {
            scrollView(scroller, target);
        }
    });

    useEffect(() => {
        if (!heldId) {
            return undefined;
        }

        revealHeld();
        const timer = window.setTimeout(revealHeld, HELD_SETTLE_MS);

        return () => window.clearTimeout(timer);
    }, [heldId]);

    const { pointLater, unpoint, menuOpenChange, menuOpen, pointedId, forgetGone } =
        usePointing(onPoint);

    // The press a click finishes, for selection.
    const pressRef = useRef<{
        target: SelectTarget;
        x: number;
        y: number;
        closedMenu: boolean;
    } | null>(null);

    // A card that leaves the sheet stops being pointed at, and its menu,
    // which unmounts with it, stops counting as open.
    useEffect(() => {
        const isLive = (id: string) => !!slots[id] && !slots[id].leaving;
        const id = pointedId();

        if (id !== null && !isLive(id)) {
            unpoint(id);
        }

        forgetGone(isLive);
    }, [slots, pointedId, unpoint, forgetGone]);

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
    const titledIds = titledGhosts(Object.values(ghosts).filter((ghost) => !ghost.leaving));
    const sheetHeight =
        origin.y +
        Math.max(bottomRow + GAP + (drag ? DRAG_SLACK : 0), resizing.floor?.rows ?? 0) * CELL;

    // From one question to the next the sheet keeps the tallest height it
    // reached. A card that lands a few rows shorter than its placeholder, or
    // an old card that leaves, would otherwise clamp a scroll that has come
    // to rest back by the difference. Set before the browser lays the change
    // out.
    useLayoutEffect(() => {
        if (!dockAware) {
            return;
        }

        heldSheet.current = Math.max(heldSheet.current, sheetHeight);
        boardRef.current?.style.setProperty('--sheet-held', `${heldSheet.current}px`);
    });

    return (
        <div
            ref={boardRef}
            className={classNames(
                styles.board,
                pan.panning && styles.boardPanning,
                dockAware && styles.boardPrompt,
            )}
            style={{
                width:
                    origin.x +
                    Math.max(rightCol + GAP + (drag ? DRAG_SLACK : 0), resizing.floor?.cols ?? 0) *
                        CELL,
                height: dockAware
                    ? `calc(max(${sheetHeight}px, var(--sheet-held, 0px)) + max(var(--board-foot), var(--board-foot-held, 0px)))`
                    : sheetHeight,
            }}
            {...(onSelect && {
                // Pointer capture can retarget the click that ends a press
                // (a pan on touch), so the press decides what it selects.
                // Presses in a portalled menu reach here through React and
                // are not the board's.
                onPointerDownCapture: (event: React.PointerEvent<HTMLDivElement>) => {
                    const target = event.target;

                    pressRef.current =
                        target instanceof Element && event.currentTarget.contains(target)
                            ? {
                                  target: selectTarget(target),
                                  x: event.clientX,
                                  y: event.clientY,
                                  closedMenu: menuOpen(),
                              }
                            : null;
                },
            })}
            onPointerDown={pan.startPan}
            onPointerMove={pan.movePan}
            onPointerUp={pan.endPan}
            onPointerCancel={pan.endPan}
            // Test rig for the arrival shockwave: a plain click on the empty
            // sheet (no pan, no card, no interactive target) ripples from
            // wherever you clicked.
            onClick={(event) => {
                const press = pressRef.current;

                pressRef.current = null;

                // A keyboard click (detail 0) is the select toggle's own.
                if (onSelect && press && event.detail > 0) {
                    const next = selectionAfter({
                        target: press.target,
                        moved:
                            Math.hypot(event.clientX - press.x, event.clientY - press.y) >=
                            DRAG_THRESHOLD,
                        closedMenu: press.closedMenu,
                        selected: selectedId,
                    });

                    if (next !== undefined) {
                        onSelect(next);
                    }
                }

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
            <BeaconLayer beacons={beacons} onFly={flyTo} clearPrompt={dockAware} />

            {dockAware && (
                <span className={styles.footProbe} data-board-foot="" aria-hidden="true" />
            )}

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

            {/* The cards a running turn announced stand as dashed outlines at the
                place and size their cards will take. They take no focus, open
                no menu and cannot be selected, and the status below announces
                each batch once. */}
            {Object.values(ghosts).map((ghost) => (
                <div
                    key={ghost.id}
                    className={classNames(styles.coming, ghost.leaving && styles.comingLeaving)}
                    style={{
                        left: origin.x + ghost.col * CELL,
                        top: origin.y + ghost.row * CELL,
                        width: ghost.w * CELL,
                        height: ghost.h * CELL,
                    }}
                    aria-hidden="true"
                    data-coming={ghost.id}
                >
                    <p className={styles.comingLabel}>
                        <span className={styles.comingKind}>{ghostLabel(ghost.type)}</span>
                        {ghost.title && titledIds.has(ghost.id) && (
                            <span className={styles.comingTitle}>{ghost.title}</span>
                        )}
                    </p>
                </div>
            ))}
            {prompt && (
                <span role="status" className={styles.comingStatus}>
                    {Object.values(ghosts).some((ghost) => !ghost.leaving) ? notice : ''}
                </span>
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
                // A card's derived height follows its content, so its grip
                // changes the width alone — except a chart view at a ratio,
                // whose height the grip sets (the card turns it into its
                // ratio) within the view's range.
                const widthOnly =
                    heightIsDerived(widget, cardView) && !heightIsFree(cardView, chartSource);
                const hRange = gripRange(widget, cardView, slot.h);
                const dimmed = !!dimKind && effectiveKind(widget, views[widget.id]) !== dimKind;
                const unitOffer =
                    onChangeUnit && !readOnly && !isLeaving ? cardUnitOffer(widget) : null;
                const extras: CardExtras = {
                    pinned: pinnedIds.includes(widget.id),
                    title,
                    view: cardView,
                    viewChoices: choices,
                    onPin: () => onTogglePin(widget.id),
                    onRemove: () => onRemove(widget.id),
                    onAsk: () => onAskFollowUp(widget.id, title),
                    unitOffer,
                    onChangeUnit:
                        unitOffer && onChangeUnit ? (unit) => onChangeUnit(widget.id, unit) : null,
                    unitHeld: unitOffer ? changesHeld : null,
                    onInfo: isText ? null : () => onCardInfo(widget.id),
                    onDownload:
                        onDownload && cardRefOf(widget) ? () => onDownload(widget.id) : null,
                    // Every kind of card photographs the same way, a text
                    // card included — it is the card's own face, not its
                    // data, so there is nothing to have or lack.
                    onDownloadImage:
                        isLeaving || readOnly ? null : () => saveCardImage(widget.id, title),
                    onEdit: isText ? () => onEditText(widget.id) : () => onEditTitle(widget.id),
                    editLabel: isText ? 'Edit Card' : 'Edit Title',
                    note: isText ? undefined : notes[widget.id],
                    onNote: isText ? null : () => onEditNote(widget.id),
                    onRemoveNote: isText ? null : () => onRemoveNote(widget.id),
                    onView: (next) => onViewChange(widget.id, next),
                    onShare: onShare && !readOnly ? () => onShare(widget.id) : null,
                    readOnly,
                    live: cardLiveOf(live, widget.id),
                    onViewPlan:
                        onViewPlan && !readOnly && viewPlanIds?.has(widget.id)
                            ? () => onViewPlan(widget.id)
                            : null,
                    menuFit: !!onViewPlan,
                    ...((onSelect || onPoint) && {
                        onMenuOpenChange: (open: boolean) => menuOpenChange(widget.id, open),
                    }),
                };
                const selected = !!onSelect && selectedId === widget.id;
                const pointable = !!onPoint && !isLeaving;

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
                        data-card-id={widget.id}
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
                            so the resize grip rides along with the card
                            instead of hanging off the static slot.

                            The card moves by its head row and its frame
                            (cardPress.ts); the content clicks and selects.
                            Only a fading card cannot be dragged. Pinned ones
                            still can, since the pin guards against INCOMING
                            widgets, not the user. */}
                        <div
                            className={styles.cardBox}
                            data-card-box=""
                            // Read by cardPress.ts and the cursors: a read-only
                            // card or a fading one is not draggable, so a press
                            // on it pans the board.
                            data-draggable={!isLeaving && !readOnly ? '' : undefined}
                            data-selected={selected ? '' : undefined}
                            data-held={heldId === widget.id ? '' : undefined}
                            data-lit={litIds?.includes(widget.id) ? '' : undefined}
                            {...(pointable && {
                                onPointerEnter: (event: React.PointerEvent) => {
                                    if (event.pointerType !== 'touch') {
                                        pointLater(widget.id);
                                    }
                                },
                                onPointerLeave: () => unpoint(widget.id),
                                onFocus: () => pointLater(widget.id),
                                onBlur: (event: React.FocusEvent) => {
                                    if (!event.currentTarget.contains(event.relatedTarget)) {
                                        unpoint(widget.id);
                                    }
                                },
                            })}
                            {...(!isLeaving &&
                                !readOnly && {
                                    onPointerDown: dragging.startDrag(widget.id),
                                    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
                                        // Movement restarts the rest until the
                                        // card is pointed at.
                                        if (pointable && event.pointerType !== 'touch') {
                                            pointLater(widget.id);
                                        }

                                        dragging.moveDrag(event);
                                    },
                                    onPointerUp: dragging.endDrag(true),
                                    onPointerCancel: dragging.endDrag(false),
                                })}
                        >
                            {/* The card's selection toggle: the keyboard's
                                way to select it, and what a screen reader
                                reads its state from. A pointer selects by
                                pressing the card (the board's click). */}
                            {onSelect && !readOnly && !isLeaving && (
                                <button
                                    type="button"
                                    className={styles.selectToggle}
                                    // The shell focuses a card by this hook.
                                    data-card-select=""
                                    aria-pressed={selected}
                                    aria-label={title}
                                    data-no-export=""
                                    onClick={() => onSelect(selected ? null : widget.id)}
                                />
                            )}
                            {!isLeaving && (!readOnly || resizable) && !isText && (
                                <span
                                    className={classNames(
                                        styles.resizeGrip,
                                        widthOnly && styles.resizeGripWidth,
                                    )}
                                    data-nowave=""
                                    onPointerDown={resizing.startResize(
                                        widget.id,
                                        widthOnly,
                                        hRange,
                                    )}
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
                                heightCells={slot.h}
                                onFit={(rows) => fitRows(widget.id, rows)}
                                ratio={ratios[widget.id]}
                                onRatio={(ratio) => onRatioChange(widget.id, ratio)}
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
