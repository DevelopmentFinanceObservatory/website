import { uuid } from '../uuid.ts';

/**
 * Callers waiting for a conversation's next save to land. A guest canvas
 * restored after sign-in has no owner until its first save claims it, and
 * the harness state read answers 404 before then, so the reopened canvas
 * reads the harness only once `wait` resolves true. Saves of one
 * conversation can be in flight together. `sending` marks a save sent and
 * answers the function that hears its outcome: a save the server took
 * settles the conversation's waiters true, and a refused one settles them
 * false once no other save of it is in flight, since that one may still
 * land. `track` resolves false for the waiters of any other conversation,
 * since the page has left theirs.
 */
export const createSaveWaiters = () => {
    let waiting: { id: string; resolve: (saved: boolean) => void }[] = [];
    // Saves sent and not yet answered, by conversation.
    const inFlight = new Map<string, number>();

    const settle = (keep: (id: string) => boolean, saved: boolean) => {
        const done = waiting.filter((waiter) => !keep(waiter.id));

        waiting = waiting.filter((waiter) => keep(waiter.id));
        done.forEach((waiter) => waiter.resolve(saved));
    };

    return {
        wait: (id: string): Promise<boolean> =>
            new Promise((resolve) => {
                waiting.push({ id, resolve });
            }),
        sending: (id: string) => {
            inFlight.set(id, (inFlight.get(id) ?? 0) + 1);

            return (ok: boolean) => {
                const left = (inFlight.get(id) ?? 1) - 1;

                if (left > 0) {
                    inFlight.set(id, left);
                } else {
                    inFlight.delete(id);
                }

                if (ok || left === 0) {
                    settle((other) => other !== id, ok);
                }
            };
        },
        track: (id: string | null) => settle((other) => other === id, false),
    };
};

/**
 * The fields that order one page's saves of a conversation on the server: a
 * writer id minted once (`saveWriter`), and a sequence number that grows
 * with each snapshot built (`saveSeq`). The server ignores a save when the
 * stored row has the same writer and a higher sequence number, so an older
 * snapshot that lands last changes nothing.
 */
export const createSaveStamp = (saveWriter: string = uuid()) => {
    let saveSeq = 0;

    return (): { saveWriter: string; saveSeq: number } => {
        saveSeq += 1;

        return { saveWriter, saveSeq };
    };
};
