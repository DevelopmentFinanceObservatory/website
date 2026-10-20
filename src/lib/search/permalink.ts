/**
 * The search page's permalink: `?q=` is the query text; when the user has
 * edited one or more parts (a slot, the dates, an added criterion, a picked
 * candidate), every part's latest edit travels along as `?s=`, deflated and
 * base64url'd, so a refresh (or a pasted link) replays the same edits instead
 * of falling back to the raw text.
 *
 * `?s=` carries a `PermalinkState`, not a raw `ResolveInput`: the engine's
 * `dataset_resubmit` door posts every part's current entry, not a stored
 * one, so no single wire request lets a permalink replay cold. The client
 * instead runs `query` fresh, then, right after its `response` event, builds
 * one `entries` list from those fresh parts with every stored edit applied
 * as an override at its own index, and posts that once (useSearchRun.ts's
 * `replay`). This costs two round trips by design: a cold `parsed` re-post
 * of just the edits, skipping the base run entirely, cannot work here,
 * because `restatement` is null on every entry kind this permalink can
 * store, so the phrase editor would have nothing to work from until a fresh
 * run anyway.
 */

import { isAssumptions } from './searchShareRequest.ts';
import type { DatasetIdentityEntry, DatasetParsedEntry } from './types';

const PREFIX_DEFLATE = 'd.';
const PREFIX_PLAIN = 'p.';

const toBase64Url = (bytes: Uint8Array): string => {
    // Chunked: a spread of a large array blows the call stack.
    let binary = '';

    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }

    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (text: string): Uint8Array => {
    const padded = text
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(text.length / 4) * 4, '=');

    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

const pipe = async (bytes: Uint8Array, stream: ReadableWritablePair<Uint8Array, BufferSource>) => {
    const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);

    return new Uint8Array(await new Response(out).arrayBuffer());
};

export const encodeSearchState = async (input: unknown): Promise<string> => {
    const raw = new TextEncoder().encode(JSON.stringify(input));

    if (typeof CompressionStream === 'undefined') {
        return PREFIX_PLAIN + toBase64Url(raw);
    }

    try {
        return PREFIX_DEFLATE + toBase64Url(await pipe(raw, new CompressionStream('deflate-raw')));
    } catch {
        return PREFIX_PLAIN + toBase64Url(raw);
    }
};

export const decodeSearchState = async <T = unknown>(text: string): Promise<T | null> => {
    try {
        if (text.startsWith(PREFIX_PLAIN)) {
            return JSON.parse(
                new TextDecoder().decode(fromBase64Url(text.slice(PREFIX_PLAIN.length))),
            ) as T;
        }

        if (text.startsWith(PREFIX_DEFLATE) && typeof DecompressionStream !== 'undefined') {
            const bytes = await pipe(
                fromBase64Url(text.slice(PREFIX_DEFLATE.length)),
                new DecompressionStream('deflate-raw'),
            );

            return JSON.parse(new TextDecoder().decode(bytes)) as T;
        }
    } catch {
        // A hand-edited or truncated link falls back to the query text.
    }

    return null;
};

// ---------------------------------------------------------------------------
// `?s=` payload: the raw query plus every part's latest edit.
// ---------------------------------------------------------------------------

/** Self-contained: an identity entry's identity and a parsed entry's part
 *  carry every input the door needs, so a stored edit replays regardless of what the fresh query returns. Guards a
 *  stale replay: an edit only replays when the freshly-run query's part at
 *  this index still asks the same base variable it did when recorded.
 *  Otherwise it's skipped with a one-line note. */
export interface PermalinkEdit {
    part: number;
    variableText: string | null;
    entry: DatasetIdentityEntry | DatasetParsedEntry;
}

/** `?s=` payload: the raw query plus every part's latest edit, in part
 *  order. On load the page runs `query`, then, right after its `response`
 *  event (not `done`, not serially), builds one `entries` list from those
 *  fresh parts with every edit applied as an override at its own index, and
 *  posts it once through `dataset_resubmit` (useSearchRun.ts's `replay`). A
 *  link with edits costs two engine round trips on open, regardless of how
 *  many parts were edited. */
export interface PermalinkState {
    query: string;
    edits: PermalinkEdit[];
}

export const encodePermalinkState = (state: PermalinkState): Promise<string> =>
    encodeSearchState(state);

/** An older identity-only link decodes unchanged. Any other landed kind is
 *  dropped rather than failing the whole ?s= payload. */
const isReplayableEditEntryKind = (kind: unknown): kind is PermalinkEdit['entry']['entry_kind'] =>
    kind === 'identity' || kind === 'parsed';

/** An identity entry as the door takes it today. A link stored before the
 *  door derived membership from the identity also carries the base it was
 *  edited from and the StatVars it served, which the door refuses. The
 *  entry's `assumptions` echo survives as stored, [] included, when Search
 *  would take it; a list it would refuse is dropped, and the engine then
 *  states the part's assumptions as for a fresh request. */
const replayableEntry = (entry: PermalinkEdit['entry']): PermalinkEdit['entry'] => {
    if (entry.entry_kind !== 'identity') return entry;

    const { variable_text, identity, entity_groups, operations, assumptions } = entry;

    return {
        entry_kind: 'identity',
        variable_text,
        identity,
        ...(entity_groups ? { entity_groups } : {}),
        ...(operations ? { operations } : {}),
        ...(isAssumptions(assumptions) ? { assumptions } : {}),
    };
};

export const decodePermalinkState = async (text: string): Promise<PermalinkState | null> => {
    const decoded = await decodeSearchState<PermalinkState>(text);
    if (!decoded) return null;

    const edits = Array.isArray(decoded.edits)
        ? decoded.edits
              .filter((edit) => isReplayableEditEntryKind(edit?.entry?.entry_kind))
              .map((edit) => ({ ...edit, entry: replayableEntry(edit.entry) }))
        : [];

    return { ...decoded, edits };
};
