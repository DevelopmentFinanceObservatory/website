/**
 * The one info note open on the page: an About line's note or a menu row's
 * note (GraphInfo.tsx's useSideNote). Opening a note closes any other, so
 * two cannot overlap.
 *
 * A note opens on `show` (hover, keyboard focus, row highlight) and closes
 * on `hide` unless a `toggle` (a press on its mark) pinned it. A pinned note
 * closes on a second press, on `close` (its mark moved, an outside press,
 * Escape, a resize, its menu closing), or when another note opens.
 */

export type OpenNote = { id: string; pinned: boolean } | null;
export type NoteEvent = { type: 'show' | 'hide' | 'toggle' | 'close'; id: string };

export const nextNote = (note: OpenNote, { type, id }: NoteEvent): OpenNote => {
    const own = note !== null && note.id === id ? note : null;

    switch (type) {
        case 'show':
            return own ?? { id, pinned: false };
        case 'hide':
            return own && !own.pinned ? null : note;
        case 'toggle':
            return own?.pinned ? null : { id, pinned: true };
        case 'close':
            return own ? null : note;
    }
};

let current: OpenNote = null;
const listeners = new Set<() => void>();

export const readNote = (): OpenNote => current;

export const subscribeNote = (listener: () => void): (() => void) => {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
};

export const sendNote = (event: NoteEvent): void => {
    const next = nextNote(current, event);

    if (next === current) {
        return;
    }

    current = next;
    listeners.forEach((listener) => listener());
};
