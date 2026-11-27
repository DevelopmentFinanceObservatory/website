/**
 * What a press on the whiteboard does, decided in one place for both the
 * card's drag handler and the board's pan handler.
 *
 * A card moves by its head row (`[data-drag-handle]` on CardHead and on a
 * LivePlaceholder's title) and its frame (the card's own box: its padding and
 * the gaps between its rows). A wrapper inside the article that only lays
 * rows out, such as TextCard's measured `textInner`, carries
 * `data-card-frame`: a press on the wrapper itself is frame, a press on a row
 * inside it is that row's.
 * With a mouse or pen a press on the content clicks and selects text; with
 * touch it pans the board, as does any press on a read-only card. Controls
 * keep the press to themselves.
 */

/**
 * Everything inside a card that owns its own press. `data-no-drag` is the
 * opt-out for anything the selector cannot name.
 */
const CONTROLS = 'button, a, input, textarea, select, [role="menuitem"], [data-no-drag]';

// The card's transform box in Whiteboard.tsx; `data-draggable` marks one the
// reader may move (absent on a read-only canvas and on a fading card).
const BOX = '[data-card-box]';

// A drag lifts the card only after the pointer travels this far (px), so a
// press on the head or frame that does not move stays a click.
export const DRAG_THRESHOLD = 4;

export type PressZone = 'control' | 'handle' | 'content';

export type PressAction = 'drag' | 'pan' | 'none';

export type Press = {
    // PointerEvent.pointerType: 'mouse', 'pen' or 'touch'.
    pointerType: string;
    zone: PressZone;
    readOnly: boolean;
};

export const pressAction = ({ pointerType, zone, readOnly }: Press): PressAction => {
    if (zone === 'control') {
        return 'none';
    }

    if (readOnly) {
        return 'pan';
    }

    if (zone === 'handle') {
        return 'drag';
    }

    // A finger has no other way to move the board, so content pans it.
    return pointerType === 'touch' ? 'pan' : 'none';
};

// A pending drag lifts the card once the pointer has moved far enough.
export const dragLifts = (dx: number, dy: number): boolean => Math.hypot(dx, dy) >= DRAG_THRESHOLD;

type PressTarget = Pick<Element, 'closest' | 'hasAttribute' | 'tagName'>;

export const pressZone = (target: PressTarget, box: unknown): PressZone => {
    if (target.closest(CONTROLS)) {
        return 'control';
    }

    // The box itself answers for a filtered-out card, whose article ignores
    // the pointer.
    if (
        target === box ||
        target.tagName === 'ARTICLE' ||
        target.hasAttribute('data-card-frame') ||
        target.closest('[data-drag-handle]')
    ) {
        return 'handle';
    }

    return 'content';
};

/**
 * The action for a pointer press on the board, or null when it did not land
 * on a card.
 */
export const cardPressAction = (event: {
    target: EventTarget | null;
    pointerType: string;
}): PressAction | null => {
    const target = event.target as Element | null;
    const box = target?.closest?.(BOX);

    if (!target || !box) {
        return null;
    }

    return pressAction({
        pointerType: event.pointerType,
        zone: pressZone(target, box),
        readOnly: !box.hasAttribute('data-draggable'),
    });
};

/**
 * What a press landed on, for selection: a card (and where on it), the empty
 * sheet, or a control of the sheet's own (a beacon).
 */
export type SelectTarget = { card: string; zone: PressZone } | 'grid' | 'control';

/**
 * The selection after a press that ended in a click, or undefined when the
 * press changes nothing. A press that moved (a drag or a pan) or that closed
 * a card menu selects nothing; a press on a card's controls is theirs; a
 * press elsewhere on a card toggles it; a press on the empty sheet clears.
 */
export const selectionAfter = ({
    target,
    moved,
    closedMenu,
    selected,
}: {
    target: SelectTarget;
    moved: boolean;
    closedMenu: boolean;
    selected: string | null;
}): string | null | undefined => {
    if (moved || closedMenu || target === 'control') {
        return undefined;
    }

    if (target === 'grid') {
        return selected === null ? undefined : null;
    }

    if (target.zone === 'control') {
        return undefined;
    }

    return selected === target.card ? null : target.card;
};

/** The selection target of a pointer press inside the board element. */
export const selectTarget = (target: Element): SelectTarget => {
    const box = target.closest(BOX);
    const card = box?.closest('[data-card-id]')?.getAttribute('data-card-id');

    if (box && card) {
        return { card, zone: pressZone(target, box) };
    }

    return target.closest(`${CONTROLS}, [data-beacon]`) ? 'control' : 'grid';
};

/**
 * The cards whose menu still counts as open: those still live on the sheet.
 * A menu that unmounts with its card (taken off, or redrawn under a new id)
 * reports no close, so its card's id is dropped here. Returns `open` itself
 * when every id is live.
 */
export const liveMenus = (
    open: ReadonlySet<string>,
    isLive: (id: string) => boolean,
): ReadonlySet<string> => {
    const kept = [...open].filter(isLive);

    return kept.length === open.size ? open : new Set(kept);
};
