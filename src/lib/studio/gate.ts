/** Runs `task` once one of the gate's places is free. */
export type Gate = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * A gate that runs at most `max` tasks at once. A finishing task hands its
 * place to the longest waiter, so a late caller cannot take it first.
 */
export const gateOf = (max: number): Gate => {
    let running = 0;
    const waiting: (() => void)[] = [];

    return async (task) => {
        if (running < max) {
            running += 1;
        } else {
            await new Promise<void>((resolve) => waiting.push(resolve));
        }

        try {
            return await task();
        } finally {
            const next = waiting.shift();

            if (next) {
                next();
            } else {
                running -= 1;
            }
        }
    };
};
