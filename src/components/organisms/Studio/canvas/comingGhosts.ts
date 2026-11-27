// Relative .ts imports, so the node test runner loads this module as it is.
import type { Widget } from '../../../../lib/chat/widgets.ts';
import { type FloorItem, floorItems, newcomerSpot, type Placement } from './blocks.ts';
import type { ComingCard } from '../../../../lib/studio/comingCards.ts';
import { estimatedRows } from '../../../../lib/studio/chartFit.ts';
import { clamp, type Rect, SPAN_DEFAULT, SPAN_MAX, SPAN_MIN, type Slots } from './layout.ts';

/**
 * The placeholders of the cards a running turn has announced, and where each
 * stands. A placeholder holds the place and size its card will take, so the
 * card lands with nothing moving. The card that names it (`placeholderId`)
 * takes over its rect in the same update that marks it leaving, and the
 * outline fades out under the card.
 */

/** A card the answer announced (comingCards.ts). A `type` names the kind on
 *  its way, and null means a waiting plan names the card without its kind. */
export type Coming = ComingCard;
export type ComingType = ComingCard['type'];

export type Ghost = Rect & {
    id: string;
    type: ComingType;
    title: string;
    turn: number;
    // When it was placed (ms), for the re-seat below.
    at: number;
    leaving?: boolean;
    // When it started leaving (ms), so it is pruned only once its fade ends.
    leftAt?: number;
};

export type Ghosts = Record<string, Ghost>;

// A placeholder is seated afresh by every placement for this long after it
// appears, so cards leaving in the update after its announcement (a removal
// held to arrive with it) free their place to it before it has faded in.
export const RESEAT_MS = 300;

// A plan that waits shows its placeholders no taller than this many cells, so
// the prompt box does not cover them.
export const PLANNED_ROWS_MAX = 10;

/** The widget kind whose footprint a placeholder of `type` holds. */
export const kindOf = (type: ComingType): Widget['kind'] =>
    type === 'stat_card' ? 'key_number' : type === 'table' ? 'table' : 'chart';

// A chart's height is not known before its data arrives. A placeholder takes
// the height a fresh card of one series spawns at (spawnSpan's estimate), so a
// line chart lands close to its placeholder.
const CHART_ROWS = clamp(
    estimatedRows({ categories: [], horizontal: false, series: [] }, true, SPAN_DEFAULT.chart.w),
    SPAN_MIN.chart.h,
    SPAN_MAX.chart.h,
);

/** The footprint, in cells, of a placeholder of `type`. */
export const ghostSpan = (type: ComingType): { w: number; h: number } => {
    const kind = kindOf(type);
    const { w, h } = SPAN_DEFAULT[kind];
    const rows = kind === 'chart' ? CHART_ROWS : h;

    return { w, h: type === null ? Math.min(rows, PLANNED_ROWS_MAX) : rows };
};

// The kind's name as the session panel shows it.
const KIND_WORDS: Record<Exclude<ComingType, null>, string> = {
    line_chart: 'Line chart',
    bar_chart: 'Bar chart',
    stat_card: 'Key number',
    table: 'Table',
};

/** A placeholder's label, such as `Line chart · drawing`, or `Planned` for a
 *  card whose kind a waiting plan has not named. */
export const ghostLabel = (type: ComingType): string =>
    type === null ? 'Planned' : `${KIND_WORDS[type]} · drawing`;

/** The placeholders whose label another in the same list shares, which show
 *  their titles to be told apart. */
export const titledGhosts = (ghosts: readonly Pick<Ghost, 'id' | 'type'>[]): Set<string> => {
    const count = new Map<string, number>();

    for (const ghost of ghosts) {
        const label = ghostLabel(ghost.type);

        count.set(label, (count.get(label) ?? 0) + 1);
    }

    return new Set(
        ghosts
            .filter((ghost) => (count.get(ghostLabel(ghost.type)) ?? 0) > 1)
            .map((ghost) => ghost.id),
    );
};

/** The placeholder id a landed card names, when it names one. */
export const placeholderOf = (widget: Widget): string | null =>
    'placeholderId' in widget && typeof widget.placeholderId === 'string'
        ? widget.placeholderId
        : null;

/** What a ghost reads as to the block floor. */
const floorOfGhost = (ghost: Ghost): FloorItem => ({
    row: ghost.row,
    h: ghost.h,
    turn: ghost.turn,
});

/**
 * The placeholders after the announced list or the cards change. A placeholder
 * whose card has landed (`claimed`) starts leaving and fades out under the
 * card. One that left the list with no card starts leaving and stops holding
 * its rect until it is pruned. Either records when it started leaving
 * (`leftAt`). A new entry takes the first spot of its question's block clear of the
 * cards and the placeholders already standing. Returns `current` itself when
 * nothing changed.
 */
export const placeGhosts = ({
    current,
    coming,
    claimed,
    slots,
    cols,
    placement,
    now,
}: {
    current: Ghosts;
    coming: readonly Coming[];
    // The placeholder ids that live cards name.
    claimed: ReadonlySet<string>;
    slots: Slots;
    cols: number;
    placement: Placement;
    now: number;
}): Ghosts => {
    const wanted = new Map(
        coming.filter((entry) => !claimed.has(entry.id)).map((entry) => [entry.id, entry]),
    );
    const next: Ghosts = {};
    // The birth time of a placeholder seated afresh.
    const born = new Map<string, number>();
    let changed = false;

    for (const [id, ghost] of Object.entries(current)) {
        const entry = wanted.get(id);

        if (claimed.has(id) || !entry) {
            // A claimed one's card stands in its place, and the outline fades
            // out under it.
            next[id] = ghost.leaving ? ghost : { ...ghost, leaving: true, leftAt: now };
            changed ||= !ghost.leaving;
        } else if (!ghost.leaving && now - ghost.at < RESEAT_MS) {
            born.set(id, ghost.at);
        } else if (ghost.leaving || ghost.type !== entry.type || ghost.title !== entry.title) {
            next[id] = {
                ...ghost,
                type: entry.type,
                title: entry.title,
                leaving: false,
                leftAt: undefined,
            };
            changed = true;
        } else {
            next[id] = ghost;
        }
    }

    const fresh = [...wanted.values()].filter((entry) => !next[entry.id]);

    if (fresh.length === 0) {
        return changed ? next : current;
    }

    const standing = (): Ghost[] => Object.values(next).filter((ghost) => !ghost.leaving);
    const occupied = (): Rect[] => [
        ...Object.values(slots).filter((slot) => !slot.leaving),
        ...standing(),
    ];

    for (const entry of fresh) {
        const { w, h } = ghostSpan(entry.type);
        const spot = newcomerSpot({
            turn: entry.turn,
            w,
            h,
            saved: null,
            occupied: occupied(),
            floor: [...floorItems(slots), ...standing().map(floorOfGhost)],
            cols,
            placement,
            nearest: () => null,
        });

        next[entry.id] = {
            ...spot,
            w,
            h,
            id: entry.id,
            type: entry.type,
            title: entry.title,
            turn: entry.turn,
            at: born.get(entry.id) ?? now,
        };
    }

    return next;
};

// The noun a batch of announced cards goes by.
const NOUNS: Record<Exclude<ComingType, null>, [string, string]> = {
    line_chart: ['chart', 'charts'],
    bar_chart: ['chart', 'charts'],
    stat_card: ['key number', 'key numbers'],
    table: ['table', 'tables'],
};

/** What assistive technology hears once for a batch of placeholders, such as
 *  `2 charts on the way`. A batch of unnamed kinds from a waiting plan reads
 *  `2 cards planned`. */
export const comingNotice = (batch: readonly Pick<Ghost, 'type'>[]): string => {
    const count = batch.length;
    const kinds = new Set(batch.map((ghost) => (ghost.type ? NOUNS[ghost.type][1] : null)));

    if (batch.every((ghost) => ghost.type === null)) {
        return `${count} ${count === 1 ? 'card' : 'cards'} planned`;
    }

    const [only] = [...kinds];
    const noun =
        kinds.size === 1 && only
            ? count === 1
                ? batch[0]?.type
                    ? NOUNS[batch[0].type][0]
                    : 'card'
                : only
            : count === 1
              ? 'card'
              : 'cards';

    return `${count} ${noun} on the way`;
};
