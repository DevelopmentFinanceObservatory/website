/**
 * Decides when the download menu asks the options door for a spec's options
 * document. One request is out per spec: opening the menu again while it is
 * pending reuses it, a document that arrived is kept, and a request that
 * failed (the door answers `null` for a 503, a network failure or an abort)
 * clears the marker so the next open asks again. Only `ask` starts a
 * request, so a re-render never retries.
 *
 * This module has no DOM dependency, so `node --test` can import it directly.
 */

export type OptionsAsker<T> = {
    /** The pending answer when this call starts a request, null when the spec
     *  is already asked for or answered. */
    ask: (specId: string, request: () => Promise<T | null>) => Promise<T | null> | null;
    /** The request in flight for the spec, if any, so a caller that needs
     *  the answer can wait on it instead of asking twice. */
    pending: (specId: string) => Promise<T | null> | null;
    /** Marks a spec as answered by other means (a mint's manifest). */
    answered: (specId: string) => void;
    /** Forgets the spec, so the next `ask` makes a request. */
    reset: () => void;
};

export function optionsAsker<T>(): OptionsAsker<T> {
    // Each marker is its own object, so a request that fails after a reset
    // or a newer marker leaves that marker alone.
    let marker: { specId: string; request?: Promise<T | null> } | null = null;

    return {
        ask: (specId, request) => {
            if (marker?.specId === specId) return null;

            const own: { specId: string; request?: Promise<T | null> } = { specId };

            marker = own;
            own.request = request().then((options) => {
                if (marker === own) {
                    marker = options === null ? null : { specId };
                }

                return options;
            });

            return own.request;
        },
        pending: (specId) => (marker?.specId === specId ? (marker.request ?? null) : null),
        answered: (specId) => {
            marker = { specId };
        },
        reset: () => {
            marker = null;
        },
    };
}
