/* eslint-disable @typescript-eslint/no-explicit-any -- request bodies are validated field by field below */
import type { SavedConversation } from './history.ts';
import { problem, requestInvalidProblem } from '../proxy/problem.ts';
import type { ShareKind } from './sharePrune.ts';

/**
 * A share's mode, and the two ways the nullable `share.mode` column reads.
 * A Studio share (kind `conversation`, `canvas`, or `card`) with no stored
 * mode is a snapshot: every Studio row written before the column was used
 * holds null, and each is a stored copy. A search share with no stored mode
 * is live. `isLiveStudioShare` and `searchShareMode` are the only readers of
 * the column, so the two defaults stay apart.
 *
 * Like `sharePrune.ts`, this module has no database or path-alias
 * dependency, so `node --test` imports it directly.
 */

export type ShareMode = 'live' | 'snapshot';

export type StudioShareKind = Exclude<ShareKind, 'search'>;

// Studio shares a day a guest may make from one network address. A guest's
// share has no owner, so it is a snapshot, and nobody can switch or remove it.
export const GUEST_SHARES = 10;

const MODES: ShareMode[] = ['live', 'snapshot'];

export const STUDIO_KINDS: StudioShareKind[] = ['conversation', 'canvas', 'card'];

// A conversation share carries the chat, which is written once, so only a
// canvas or a card can be live.
const LIVE_KINDS: string[] = ['canvas', 'card'] satisfies StudioShareKind[];

export const isStudioKind = (kind: string): kind is StudioShareKind =>
    (STUDIO_KINDS as string[]).includes(kind);

/** Whether a stored Studio share redraws its cards on current data. */
export const isLiveStudioShare = (row: { kind: string; mode: string | null }): boolean =>
    LIVE_KINDS.includes(row.kind) && row.mode === 'live';

/** A stored search share's mode. */
export const searchShareMode = (mode: string | null): ShareMode =>
    mode === 'snapshot' ? 'snapshot' : 'live';

export type StudioShareRequest = {
    kind: StudioShareKind;
    mode: ShareMode;
    saved: SavedConversation;
    cardId?: string;
};

/**
 * A Studio share request (`POST /api/share`), or the 400 problem document it
 * is refused with: `request_invalid`, with a `pointer` to the mode when that
 * is the fault, or `live_unsupported_kind`. A request that names no mode
 * asks for a snapshot.
 */
export const readStudioShareRequest = (body: any): StudioShareRequest | Response => {
    const saved = body?.conversation;

    if (
        typeof body?.kind !== 'string' ||
        !isStudioKind(body.kind) ||
        !saved ||
        typeof saved.id !== 'string' ||
        !Array.isArray(saved.widgets) ||
        (body.kind === 'card' && typeof body.cardId !== 'string')
    ) {
        return requestInvalidProblem(
            'The body needs a kind, a conversation with an id and widgets, and a cardId for a card.',
        );
    }

    const mode: unknown = body.mode ?? 'snapshot';

    if (!(MODES as unknown[]).includes(mode)) {
        return requestInvalidProblem('The mode is `live` or `snapshot`.', '/mode');
    }

    if (mode === 'live' && !LIVE_KINDS.includes(body.kind)) {
        return problem({
            status: 400,
            code: 'live_unsupported_kind',
            detail: 'Only a canvas or a card can be a live share.',
            retryable: false,
        });
    }

    return { kind: body.kind, mode: mode as ShareMode, saved, cardId: body.cardId };
};

/** The props of the `share.create` event, for a Studio or a search share. */
export const shareCreateProps = (created: {
    id: string;
    kind: ShareKind;
    mode: ShareMode;
}): { shareId: string; kind: ShareKind; mode: ShareMode } => ({
    shareId: created.id,
    kind: created.kind,
    mode: created.mode,
});
