import type { PlaceOptionsRead } from './studioClient';

/** Which list a places read is for: the conversation, the card and its
 *  revision, and the card's role. */
export type PlaceListAt = {
    conversation: string;
    componentId: string;
    revision: number;
    role: string;
};

// A read callers share: the read, how many callers wait on it, and the
// control that stops it once none does.
type Read = { read: Promise<PlaceOptionsRead>; callers: number; stop: AbortController };

// One card's reads, all for one conversation and one revision of the card.
type CardReads = { conversation: string; revision: number; roles: Map<string, Read> };

export type PlaceLists = {
    /** The list `at` names. Callers share one read per list, and each passes
     *  `signal` to leave it: its own promise then rejects, and the read stops
     *  once every caller has left. A caller with a signal also rejects when
     *  the store stops the read, whatever the read answers later. A read that
     *  failed is forgotten, so the next call reads again. */
    read: (at: PlaceListAt, signal?: AbortSignal) => Promise<PlaceOptionsRead>;
    /** Forgets card `componentId`'s lists and stops their reads. */
    drop: (componentId: string) => void;
    /** Forgets every list and stops every read. */
    clear: () => void;
};

/**
 * The places lists a page has read, through `run`. A card holds lists for one
 * conversation and one revision: a read for another conversation or revision
 * of the card forgets the card's lists and stops their reads first, so a list
 * is never served for a revision it was not read for.
 */
export const placeLists = (
    run: (at: PlaceListAt, signal: AbortSignal) => Promise<PlaceOptionsRead>,
): PlaceLists => {
    const cards = new Map<string, CardReads>();

    const stopAll = (card: CardReads) => {
        for (const held of card.roles.values()) held.stop.abort();
    };

    const drop = (componentId: string) => {
        const card = cards.get(componentId);

        if (!card) return;

        cards.delete(componentId);
        stopAll(card);
    };

    const readsFor = ({ conversation, componentId, revision }: PlaceListAt): CardReads => {
        const card = cards.get(componentId);

        if (card && card.conversation === conversation && card.revision === revision) {
            return card;
        }

        drop(componentId);

        const fresh: CardReads = { conversation, revision, roles: new Map() };

        cards.set(componentId, fresh);

        return fresh;
    };

    const read = (at: PlaceListAt, signal?: AbortSignal): Promise<PlaceOptionsRead> => {
        const { roles } = readsFor(at);
        let held = roles.get(at.role);

        if (!held) {
            const stop = new AbortController();
            const forget = () => {
                if (roles.get(at.role) === entry) roles.delete(at.role);
            };
            const entry: Read = {
                stop,
                callers: 0,
                read: run(at, stop.signal).then(
                    (answer) => {
                        if (answer.kind !== 'options') forget();

                        return answer;
                    },
                    (error: unknown) => {
                        forget();

                        throw error;
                    },
                ),
            };

            roles.set(at.role, entry);
            held = entry;
        }

        if (!signal) return held.read;

        const shared = held;

        shared.callers += 1;

        return new Promise((resolve, reject) => {
            let left = false;
            // Each caller counts once, whether the read ends or it leaves
            // first; returns whether this call ended it.
            const settle = (): boolean => {
                if (left) return false;

                left = true;
                signal.removeEventListener('abort', leave);
                shared.stop.signal.removeEventListener('abort', stopped);
                shared.callers -= 1;

                return true;
            };
            const stopped = () => {
                if (settle()) reject(shared.stop.signal.reason);
            };
            const leave = () => {
                if (!settle()) return;

                if (shared.callers === 0) {
                    shared.stop.abort();

                    if (roles.get(at.role) === shared) roles.delete(at.role);
                }

                reject(signal.reason);
            };

            if (signal.aborted) {
                leave();

                return;
            }

            signal.addEventListener('abort', leave, { once: true });
            shared.stop.signal.addEventListener('abort', stopped, { once: true });
            shared.read.then(
                (answer) => {
                    if (settle()) resolve(answer);
                },
                (error: unknown) => {
                    if (settle()) reject(error);
                },
            );
        });
    };

    const clear = () => {
        for (const card of cards.values()) stopAll(card);

        cards.clear();
    };

    return { read, drop, clear };
};
