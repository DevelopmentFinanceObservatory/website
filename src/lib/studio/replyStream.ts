/**
 * The text a streaming reply has received since the transcript last took it.
 *
 * useChat appends each answer `message.delta` here, keyed by the page turn
 * whose reply it belongs to, and moves the text into the transcript only at
 * a commit: `message.complete`, a pause, a Stop, or the turn's end. The
 * components that draw the reply, or that change when it begins, read the
 * pieces through useSyncExternalStore, so a delta re-renders those alone.
 *
 * Each commit takes the next number, and a piece is appended under the
 * number of the latest commit. A transcript drawn at commit `at` therefore
 * holds every piece numbered below `at` and none numbered `at` or later,
 * whichever of the store and the transcript a render reads first.
 */
export type ReplyStore = {
    subscribe: (listener: () => void) => () => void;
    /** The text appended to page turn `turn`'s reply at commit `at` or later. */
    since: (turn: number, at: number) => string;
    /** The page turns that have pieces, oldest first. */
    turns: () => number[];
    append: (turn: number, at: number, text: string) => void;
    /** Drops the pieces numbered below `at`, which every transcript drawn at
     *  `at` holds. No reader's text changes, so no listener hears of it. */
    prune: (at: number) => void;
};

/** A store with the number of the transcript's latest commit, which the
 *  transcript drawn beside it holds. */
export type ReplyStream = {
    store: ReplyStore;
    at: number;
};

type Piece = { turn: number; at: number; text: string };

export const createReplyStore = (): ReplyStore => {
    let pieces: Piece[] = [];
    const listeners = new Set<() => void>();

    return {
        subscribe: (listener) => {
            listeners.add(listener);

            return () => {
                listeners.delete(listener);
            };
        },
        since: (turn, at) =>
            pieces
                .filter((piece) => piece.turn === turn && piece.at >= at)
                .map((piece) => piece.text)
                .join(''),
        turns: () => [...new Set(pieces.map((piece) => piece.turn))],
        append: (turn, at, text) => {
            if (!text) {
                return;
            }

            const last = pieces.at(-1);

            pieces =
                last?.turn === turn && last.at === at
                    ? [...pieces.slice(0, -1), { ...last, text: last.text + text }]
                    : [...pieces, { turn, at, text }];
            listeners.forEach((listener) => listener());
        },
        prune: (at) => {
            pieces = pieces.filter((piece) => piece.at >= at);
        },
    };
};

/** Page turn `turn`'s reply as drawn: `committed`, the text the transcript
 *  holds at `stream.at`, followed by what has streamed in since. */
export const streamedText = (
    stream: ReplyStream | undefined,
    turn: number,
    committed: string,
): string => (stream ? committed + stream.store.since(turn, stream.at) : committed);
