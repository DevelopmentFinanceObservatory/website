// Relative .ts imports, so the node test runner loads this module as it is.
import type { SetStateAction } from 'react';

import { type Coming, type Ghosts, placeGhosts, placeholderOf } from './comingGhosts.ts';
import { LEAVE_MS, type Slots } from './layout.ts';
import { placeSlots, type PlaceSlotsArgs } from './placeSlots.ts';

/**
 * What the canvas holds: the cards' slots, the placeholders standing for the
 * cards on their way, and the ids of the cards the latest placement seated in
 * a standing placeholder's rect. They live in one value so every change is
 * one functional update of it, and none can overwrite another.
 */
export type Board = {
    slots: Slots;
    ghosts: Ghosts;
    claimed: ReadonlySet<string>;
};

const NO_IDS: ReadonlySet<string> = new Set();

export const EMPTY_BOARD: Board = { slots: {}, ghosts: {}, claimed: NO_IDS };

/** The board after a change to its slots alone (a fit, a drag, a raise). */
export const updateSlots = (board: Board, update: SetStateAction<Slots>): Board => {
    const slots = typeof update === 'function' ? update(board.slots) : update;

    return slots === board.slots ? board : { ...board, slots };
};

/**
 * The board after the widgets, the announced cards or the layout inputs
 * change. The cards are placed first, then the placeholders around them, so a
 * card that lands takes its placeholder's rect in the update that marks it
 * leaving.
 */
export const placeBoard = (
    board: Board,
    args: Omit<PlaceSlotsArgs, 'ghosts'> & {
        coming: readonly Coming[];
        now: number;
    },
): Board => {
    const { coming, now, ...rest } = args;
    const slots = placeSlots(board.slots, { ...rest, ghosts: board.ghosts });
    const named = new Set(args.widgets.flatMap((widget) => placeholderOf(widget) ?? []));
    const ghosts = placeGhosts({
        current: board.ghosts,
        coming,
        claimed: named,
        slots,
        cols: args.cols,
        placement: args.placement,
        now,
    });
    // The cards new to the sheet that name a placeholder already standing.
    const seated = args.widgets
        .filter((widget) => {
            const ghost = board.ghosts[placeholderOf(widget) ?? ''];

            return !board.slots[widget.id] && ghost !== undefined && !ghost.leaving;
        })
        .map((widget) => widget.id);
    const claimed = seated.length > 0 ? new Set(seated) : NO_IDS;

    return slots === board.slots && ghosts === board.ghosts && claimed === board.claimed
        ? board
        : { slots, ghosts, claimed };
};

/**
 * The board without the cards and placeholders that finished leaving at
 * `now`. A placeholder goes once LEAVE_MS has passed since it started leaving,
 * so an earlier placement's prune does not cut a later one's fade short.
 */
export const pruneBoard = (board: Board, now = Infinity): Board => {
    const slotEntries = Object.entries(board.slots);
    const ghostEntries = Object.entries(board.ghosts);
    const slots = slotEntries.filter(([, slot]) => !slot.leaving);
    const ghosts = ghostEntries.filter(
        ([, ghost]) => !ghost.leaving || now - (ghost.leftAt ?? -Infinity) < LEAVE_MS,
    );

    return slots.length === slotEntries.length && ghosts.length === ghostEntries.length
        ? board
        : {
              ...board,
              slots: slots.length === slotEntries.length ? board.slots : Object.fromEntries(slots),
              ghosts:
                  ghosts.length === ghostEntries.length ? board.ghosts : Object.fromEntries(ghosts),
          };
};
