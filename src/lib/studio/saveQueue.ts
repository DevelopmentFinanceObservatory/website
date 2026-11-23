/**
 * Conversation saves sent one at a time. Two saves of one conversation in
 * flight together can land out of order, and the older one then overwrites
 * the newer (a turn's `harnessTurn` among what it loses). While a save is in
 * flight, `push` keeps only the latest snapshot of each conversation, and
 * the next goes out once every save in flight settles. `sendNow` sends at
 * once, past a save in flight, for a page about to unload, which would never
 * send a queued save; it replaces that conversation's queued snapshot.
 * `settled` hears the outcome of every save sent.
 */
export const createSaveQueue = <T extends { id: string }>(
    send: (item: T) => Promise<boolean>,
    settled: (item: T, ok: boolean) => void,
) => {
    // The latest unsent snapshot of each conversation, in the order first queued.
    const pending = new Map<string, T>();
    let inFlight = 0;

    const start = (item: T) => {
        inFlight += 1;
        void send(item)
            .catch(() => false)
            .then((ok) => {
                inFlight -= 1;
                settled(item, ok);
                sendNext();
            });
    };

    const sendNext = () => {
        const [entry] = pending;

        if (inFlight > 0 || !entry) {
            return;
        }

        pending.delete(entry[0]);
        start(entry[1]);
    };

    return {
        push: (item: T) => {
            pending.set(item.id, item);
            sendNext();
        },
        sendNow: (item: T) => {
            pending.delete(item.id);
            start(item);
        },
    };
};
