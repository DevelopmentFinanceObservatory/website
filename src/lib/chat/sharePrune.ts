import type { SavedConversation } from './history';

// 'search' shares live in lib/search/searchShare.ts — same table, no conversation.
export type ShareKind = 'conversation' | 'canvas' | 'card' | 'search';

const pick = <T>(record: Record<string, T> | undefined, id: string): Record<string, T> =>
    record && id in record ? { [id]: record[id]! } : {};

// Every field of a saved conversation. A share stores these and no other, so
// a request cannot carry extra fields into the table. Keyed by the type, so a
// new field fails to compile until it is listed here.
const SAVED_FIELDS: Record<keyof SavedConversation, true> = {
    id: true,
    sessionId: true,
    componentRefs: true,
    title: true,
    updatedAt: true,
    messages: true,
    widgets: true,
    activity: true,
    turnCount: true,
    canvas: true,
    pinnedIds: true,
    removedIds: true,
    graceIds: true,
    graceTurn: true,
    layout: true,
    theme: true,
    views: true,
    textCards: true,
    titles: true,
    notes: true,
    shareMarks: true,
};

const savedFields = (saved: SavedConversation): SavedConversation =>
    Object.fromEntries(
        Object.entries(saved).filter(([key]) => Object.hasOwn(SAVED_FIELDS, key)),
    ) as SavedConversation;

/**
 * The part of a conversation a share of `kind` exposes. No kind carries the
 * owner's `sessionId`: it is the harness conversation id, so a viewer who read
 * it could send turns under the owner's conversation. A viewer's "Continue
 * this session" forks with `sessionId: null` and replays the transcript.
 */
export const pruneForShare = (
    saved: SavedConversation,
    kind: ShareKind,
    cardId?: string,
): SavedConversation => {
    if (kind === 'conversation') {
        return { ...savedFields(saved), sessionId: null, componentRefs: [] };
    }

    const base: SavedConversation = {
        ...savedFields(saved),
        sessionId: null,
        componentRefs: [],
        messages: [],
        activity: [],
    };

    if (kind === 'canvas') {
        return base;
    }

    const widget = saved.widgets.find((other) => other.id === cardId);
    const textCard = (saved.textCards ?? []).find((other) => other.id === cardId);

    return {
        ...base,
        widgets: widget ? [{ ...widget, turn: 1 }] : [],
        textCards: textCard ? [textCard] : [],
        pinnedIds: widget ? [widget.id] : [],
        removedIds: [],
        graceIds: [],
        graceTurn: 0,
        layout: cardId ? pick(saved.layout, cardId) : {},
        titles: cardId ? pick(saved.titles, cardId) : {},
        notes: cardId ? pick(saved.notes, cardId) : {},
        views: cardId ? pick(saved.views, cardId) : {},
        turnCount: 1,
    };
};

/**
 * A stored share as a viewer receives it. `pruneForShare` drops the owner's
 * `sessionId` on write, but a server on the previous release can still store
 * one while a deploy switches image, so every read clears it again. A search
 * share's data is `{ query }`, not a conversation, and passes through.
 */
export const shareForViewer = <Row extends { kind: string; data: unknown }>(row: Row): Row =>
    row.kind === 'search'
        ? row
        : {
              ...row,
              data: { ...(row.data as SavedConversation), sessionId: null, componentRefs: [] },
          };
