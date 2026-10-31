/**
 * What a press on the whiteboard does, decided in one place for both the
 * card's drag handler and the board's pan handler.
 *
 * A card moves by its head row (`[data-drag-handle]` on CardHead) and its
 * frame (the card's own box: its padding and the gaps between its rows).
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

type PressTarget = Pick<Element, 'closest' | 'tagName'>;

export const pressZone = (target: PressTarget, box: unknown): PressZone => {
    if (target.closest(CONTROLS)) {
        return 'control';
    }

    // The box itself answers for a filtered-out card, whose article ignores
    // the pointer.
    if (target === box || target.tagName === 'ARTICLE' || target.closest('[data-drag-handle]')) {
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
