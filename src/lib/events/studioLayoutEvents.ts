// The Prompt layout's usage events, in their own module (no db, server-only
// or alias imports) so POST /api/events, the client, the export
// (db/event-export.ts) and the tests read one definition under plain node.

import { STUDIO_VARIANTS, type StudioVariant } from '../studio/variant.ts';

/**
 * What one member may hold: one of a fixed list of strings or a boolean.
 * `{ optional }` is a fixed list the event may leave out. No member takes
 * free text, so no prompt, reply, card title, place, id or anything the
 * reader typed can pass.
 */
export type LayoutMember = readonly string[] | 'boolean' | { readonly optional: readonly string[] };

/**
 * The events the Prompt layout's own controls send, each with its members.
 * Every event also carries `variant`. Fired once per reader action from the
 * handler that performs it, never for the layout's own opens.
 */
export const STUDIO_LAYOUT_EVENTS = {
    // The session panel opened or closed: the top bar's button, Escape on
    // the panel that overlays the canvas, or a card's `More info` or
    // `View plan` opening it.
    'studio.panel': {
        action: ['open', 'close'],
        how: ['button', 'keyboard', 'card'],
    },
    // A panel page opened: from the panel's own rows, links and back
    // control (`overview` is the way back to it), or from a card's
    // `More info` (`card`) or `View plan` (`plan`).
    'studio.panel_page': {
        page: ['overview', 'turn', 'stage', 'plan', 'card', 'source'],
        from: ['panel', 'card'],
    },
    // A card selected on the canvas, or its selection cleared.
    'studio.card_select': {
        selected: 'boolean',
    },
    // Focus mode entered or left with the top bar's button, or left with
    // the focus pill.
    'studio.focus': {
        on: 'boolean',
        how: ['button', 'pill'],
    },
    // A card page's `Change`: opened, applied, cancelled, refused (`why`:
    // by the assistant or by the change queue) or blocked (`why`: a plan or
    // a question waits, or another change is pending).
    'studio.change': {
        step: ['open', 'apply', 'cancel', 'refused', 'blocked'],
        kind: ['years', 'places', 'unit'],
        why: { optional: ['assistant', 'queue', 'plan', 'question', 'pending'] },
    },
    // The reply sheet or the conversation sheet opened or folded by the
    // reader: a button, Escape, a press on the canvas, or the panel's
    // `Read it at the prompt`.
    'studio.sheet': {
        sheet: ['reply', 'conversation'],
        action: ['open', 'fold'],
        how: ['button', 'keyboard', 'canvas', 'panel'],
    },
    // A waiting plan approved or cancelled at the prompt or in the full plan.
    'studio.plan': {
        decision: ['approve', 'cancel'],
        from: ['dock', 'full_plan'],
    },
    // A new session from the top bar: `New Session` or the back arrow.
    'studio.new_session': {
        how: ['button', 'back'],
    },
} as const satisfies Record<string, Record<string, LayoutMember>>;

type Events = typeof STUDIO_LAYOUT_EVENTS;

export type LayoutEventName = keyof Events;

export const LAYOUT_EVENT_NAMES = Object.keys(STUDIO_LAYOUT_EVENTS) as LayoutEventName[];

type ValueOf<M> = M extends 'boolean' ? boolean : M extends readonly string[] ? M[number] : never;

type RequiredMembers<E> = {
    -readonly [K in keyof E as E[K] extends { optional: unknown } ? never : K]: ValueOf<E[K]>;
};

type OptionalMembers<E> = {
    -readonly [K in keyof E as E[K] extends { optional: unknown } ? K : never]?: E[K] extends {
        optional: readonly string[];
    }
        ? E[K]['optional'][number]
        : never;
};

/** An event's own members, without `variant`. */
export type LayoutMembers<N extends LayoutEventName> = RequiredMembers<Events[N]> &
    OptionalMembers<Events[N]>;

/** An event's members as the page sends them, `variant` included. */
export type LayoutEventProps<N extends LayoutEventName> = LayoutMembers<N> & {
    variant: StudioVariant;
};

export const isLayoutEventName = (name: unknown): name is LayoutEventName =>
    typeof name === 'string' && Object.hasOwn(STUDIO_LAYOUT_EVENTS, name);

const passes = (member: LayoutMember, value: unknown): boolean => {
    if (member === 'boolean') return typeof value === 'boolean';

    const values: readonly string[] = 'optional' in member ? member.optional : member;

    return typeof value === 'string' && values.includes(value);
};

/**
 * Null when `props` are exactly what `name` takes; otherwise the JSON
 * pointer, under the props, of the first member missing, unknown or out of
 * its list.
 */
export const layoutEventProblem = (
    name: LayoutEventName,
    props: Record<string, unknown>,
): string | null => {
    const members: Record<string, LayoutMember> = {
        ...STUDIO_LAYOUT_EVENTS[name],
        variant: STUDIO_VARIANTS,
    };

    for (const key of Object.keys(props)) {
        if (!Object.hasOwn(members, key) || !passes(members[key], props[key])) {
            return `/${key}`;
        }
    }

    for (const [key, member] of Object.entries(members)) {
        if (!(typeof member === 'object' && 'optional' in member) && !Object.hasOwn(props, key)) {
            return `/${key}`;
        }
    }

    return null;
};
