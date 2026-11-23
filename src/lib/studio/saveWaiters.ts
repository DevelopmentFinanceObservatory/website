/**
 * Callers waiting for a conversation's next save to land. A guest canvas
 * restored after sign-in has no owner until its first save claims it, and
 * the harness state read answers 404 before then, so the reopened canvas
 * reads the harness only once `wait` resolves true. `saved` settles the
 * waiters of a save the server took. `track` resolves false for the waiters
 * of any other conversation, since the page has left theirs.
 */
export const createSaveWaiters = () => {
    let waiting: { id: string; resolve: (saved: boolean) => void }[] = [];

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
        saved: (id: string) => settle((other) => other !== id, true),
        track: (id: string | null) => settle((other) => other === id, false),
    };
};
