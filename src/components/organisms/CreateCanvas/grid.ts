import type { Rect } from '@/components/organisms/Studio/canvas/layout';

// The section's canvas is the Studio's grid at 70%: the same cells the
// whiteboard snaps cards to (useGridCell — fluid with the root font-size),
// scaled so the cards read as a miniature of the real sheet inside the
// box. Everything in the box — pattern, fills, cards, the copy's own slot —
// rides this cell.
export const SCALE = 0.7;

// The copy's slot (description + buttons) — one more widget on the sheet,
// centred; the cards pack into whatever room is left around it.
const COPY_W = 35;
const COPY_H = 12;

export type Grid = { cols: number; rows: number; copy: Rect };

// The sheet for a box of this size (measured — its width follows the
// viewport below desktop) at this cell.
export const gridFor = (width: number, height: number, cell: number): Grid => {
    const cols = Math.floor(width / cell);
    const rows = Math.floor(height / cell);

    return {
        cols,
        rows,
        copy: {
            col: Math.floor((cols - COPY_W) / 2),
            row: Math.floor((rows - COPY_H) / 2),
            w: COPY_W,
            h: COPY_H,
        },
    };
};
