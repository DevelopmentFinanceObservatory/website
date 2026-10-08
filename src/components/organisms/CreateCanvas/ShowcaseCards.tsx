'use client';

import classNames from 'classnames';
import { useEffect, useState } from 'react';

import { type Grid, SCALE } from './grid';
import styles from './ShowcaseCards.module.scss';

import { GRID_CELL } from '@/components/atoms/GridPattern/GridPattern';
import CardBody from '@/components/organisms/Studio/canvas/cards/CardBody';
import type { CardExtras } from '@/components/organisms/Studio/canvas/cards/types';
import {
    type Rect,
    SPAN_DEFAULT,
    tooCloseRects,
} from '@/components/organisms/Studio/canvas/layout';
import cards from '@/content/home/cards.json';
import { useGridCell } from '@/hooks/useGridCell';
import { useIsPhone, useMediaQuery } from '@/hooks/useMediaQuery';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import type { Widget } from '@/lib/chat/widgets';
import { DEFAULT_THEME, deriveTheme, themeVars } from '@/lib/studio/theme';

// Real cards the Studio made (src/content/home/cards.json) on the section's
// own grid — the same cells the whiteboard snaps to, packed the way the
// sheet packs them: a card lands where it fits whole, clear of the copy's
// slot and of the other cards (the whiteboard's own GAP), and as far from
// them as the sheet allows. Every beat the oldest fades out and the next
// card fades in somewhere free. Rendered by the Studio's own card
// components.
const BEAT_MS = 3400;
// A phone shows one card at a time (see the module's styles) — it swaps
// at a calmer pace.
const PHONE_BEAT_MS = 7000;
const FADE_MS = 700;
const VISIBLE = 3;
// How far past the box's edge a card may sit, in cells — the sheet
// overflowing its viewport. Below desktop the box already fills the
// page, so barely any.
const BLEED = 4;
const BLEED_SMALL = 1;
const SMALL_QUERY = '(max-width: 1023px)';

const NOOP = () => undefined;

// Everything a card renders besides its widget — all inert here.
const extras = (title: string, view: CardExtras['view']): CardExtras => ({
    pinned: false,
    title,
    view,
    viewChoices: [],
    onPin: NOOP,
    onRemove: NOOP,
    onAsk: NOOP,
    onDownload: null,
    onEdit: NOOP,
    editLabel: '',
    // Set (to nothing) so the chrome shows the attribution line, not the tag.
    onInfo: NOOP,
    onNote: null,
    onRemoveNote: null,
    onView: NOOP,
    onShare: null,
    readOnly: true,
});

const theme = deriveTheme(DEFAULT_THEME);
const widgets = cards as Widget[];

type Tile = Rect & { key: number; card: number; leaving: boolean };

// The distance between two rects' centres, in cells.
const apart = (a: Rect, b: Rect) =>
    Math.hypot(a.col + a.w / 2 - (b.col + b.w / 2), a.row + a.h / 2 - (b.row + b.h / 2));

// A spot where a card of this span fits (up to `bleed` cells past the box)
// and keeps its distance from everything already on the sheet — chosen at
// random among the roomier spots, so cards spread over the sheet (edges
// and the middle bands included, not only the corners) without bunching
// up; a spot inside the box wins most of the time, one poking past its
// edge now and then. Null when nothing fits.
const findSpot = (
    grid: Grid,
    bleed: number,
    span: { w: number; h: number },
    taken: Rect[],
    others: Rect[],
): Rect | null => {
    const free: { rect: Rect; room: number; near: number; inside: boolean }[] = [];

    for (let row = -bleed; row + span.h <= grid.rows + bleed; row += 1) {
        for (let col = -bleed; col + span.w <= grid.cols + bleed; col += 1) {
            // Never flush with an edge of the box: a cell in, or a cell out,
            // reads as a sheet — dead on the line reads as a frame.
            // (`inside` below is then always a cell or more from the edge.)
            if (
                col === 0 ||
                row === 0 ||
                col + span.w === grid.cols ||
                row + span.h === grid.rows
            ) {
                continue;
            }

            const rect = { col, row, ...span };

            // Never in line with anything else on the sheet either: no
            // shared top, bottom, left or right edge — always at least a
            // cell of offset, so cards read as scattered, not as a row.
            const aligned = (other: Rect) =>
                rect.row === other.row ||
                rect.row + rect.h === other.row + other.h ||
                rect.col === other.col ||
                rect.col + rect.w === other.col + other.w;

            if (!taken.some((other) => tooCloseRects(rect, other) || aligned(other))) {
                free.push({
                    rect,
                    // Room from the other CARDS only — the copy is already
                    // kept clear of, and measuring from it would push
                    // everything out to the corners.
                    room: Math.min(...others.map((other) => apart(rect, other))),
                    near: apart(rect, grid.copy),
                    inside:
                        col >= 0 &&
                        row >= 0 &&
                        col + span.w <= grid.cols &&
                        row + span.h <= grid.rows,
                });
            }
        }
    }

    if (free.length === 0) {
        return null;
    }

    // Inside the box (a cell or more from its edge) or poking past it —
    // either, evenly…
    const inside = free.filter((spot) => spot.inside);
    const pool = inside.length > 0 && Math.random() < 0.5 ? inside : free;
    // …then, for a small card (a stat), the ones nearest the copy — it takes
    // little room, so it may tuck in beside it; a big card keeps its
    // distance from the other cards instead, anywhere roomy enough (within
    // 60% of the best, a band wide enough to reach past the corners) —
    // then luck.
    // A stat is the small card; a chart and a table are the big ones. Read
    // off the footprints rather than named, so it follows a re-budget — but
    // not halved: the stat is wide now (SPAN_DEFAULT), not far off a chart's
    // area.
    const small = span.w * span.h < SPAN_DEFAULT.chart.w * SPAN_DEFAULT.chart.h;
    const pick = small
        ? (() => {
              const closest = Math.min(...pool.map((spot) => spot.near));

              return pool.filter((spot) => spot.near <= closest * 1.5);
          })()
        : (() => {
              const best = Math.max(...pool.map((spot) => spot.room));

              return pool.filter((spot) => spot.room >= best * 0.6);
          })();

    return pick[Math.floor(Math.random() * pick.length)]!.rect;
};

// `grid` is the measured sheet (CreateCanvas remounts this on a change of
// size, so the opening hand below always starts from a real grid).
const ShowcaseCards = ({ grid }: { grid: Grid }) => {
    const reducedMotion = usePrefersReducedMotion();
    const phone = useIsPhone();
    const bleed = useMediaQuery(SMALL_QUERY) ? BLEED_SMALL : BLEED;
    // The whiteboard's fluid cell; the card is drawn at that size (text,
    // paddings, plot — everything as on the canvas) and the whole thing is
    // scaled down into the section's smaller cell.
    const gridCell = useGridCell();
    const cell = gridCell * SCALE;
    // The next card, on a free spot — or nothing, when none fits. Keys are
    // monotonic (one per placement) and the card cycles with them, so the
    // list itself is the only state. A card on its way out still counts as
    // taken (and as something to keep away from), so the newcomer never
    // lands right where the last one just faded; only when nothing else
    // fits does that spot come back into play.
    const place = (prev: Tile[]): Tile[] => {
        const staying = prev.filter((tile) => !tile.leaving);
        const key = prev.length ? Math.max(...prev.map((tile) => tile.key)) + 1 : 0;
        const card = key % widgets.length;
        const span = SPAN_DEFAULT[widgets[card]!.kind];
        const spot =
            findSpot(grid, bleed, span, [grid.copy, ...prev], prev) ??
            findSpot(grid, bleed, span, [grid.copy, ...staying], staying);

        return spot ? [...staying, { ...spot, key, card, leaving: false }] : staying;
    };

    // The opening hand. Random, so client-only — this component is loaded
    // with ssr: false (CreateCanvas), there is no server markup to match.
    const [tiles, setTiles] = useState<Tile[]>(() => {
        let next: Tile[] = [];

        for (let i = 0; i < VISIBLE; i += 1) {
            next = place(next);
        }

        return next;
    });

    useEffect(() => {
        if (reducedMotion) {
            return;
        }

        let fade = 0;
        const beat = window.setInterval(
            () => {
                // The oldest tile starts fading…
                setTiles((prev) => {
                    const oldest = prev.find((tile) => !tile.leaving);

                    return oldest
                        ? prev.map((tile) => (tile === oldest ? { ...tile, leaving: true } : tile))
                        : prev;
                });

                // …and once it is gone, the next card lands somewhere else.
                fade = window.setTimeout(() => {
                    setTiles(place);
                }, FADE_MS);
            },
            phone ? PHONE_BEAT_MS : BEAT_MS,
        );

        return () => {
            window.clearInterval(beat);
            window.clearTimeout(fade);
        };
        // `place` reads `grid`, which is fixed for this mount (CreateCanvas
        // remounts on a size change), so it needs no re-run.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reducedMotion, phone]);

    return (
        <div className={styles.layer} aria-hidden="true">
            {tiles.map(({ key, col, row, w, h, card, leaving }) => {
                const widget = widgets[card]!;
                const title = widget.kind === 'key_number' ? widget.label : widget.title;
                const view =
                    widget.kind === 'chart'
                        ? widget.chartType === 'line'
                            ? 'chart-line'
                            : 'chart-bar'
                        : widget.kind === 'table'
                          ? 'chart-table'
                          : null;

                return (
                    <div
                        key={key}
                        className={classNames(styles.slot, leaving && styles.slotOut)}
                        style={{
                            left: col * cell,
                            top: row * cell,
                            width: w * cell,
                            height: h * cell,
                        }}
                    >
                        <div
                            className={styles.card}
                            style={{
                                width: w * gridCell,
                                height: h * gridCell,
                                scale: SCALE,
                                ...(themeVars(theme) as React.CSSProperties),
                                // The section's own ground for the cards — the
                                // site's off-white instead of the canvas's white.
                                ['--th-card' as string]: '#f6f6e8',
                            }}
                        >
                            <CardBody
                                widget={widget}
                                view={view}
                                chartSource={widget.kind === 'chart' ? widget : null}
                                // Chart.js px ride the (unscaled) cell like on the canvas.
                                scale={gridCell / GRID_CELL}
                                theme={theme}
                                widthCells={w}
                                onFit={NOOP}
                                extras={extras(title, view)}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default ShowcaseCards;
