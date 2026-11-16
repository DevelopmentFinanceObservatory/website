// The selected country lives in the query string (?country=KEN), so a link opens on it
// and section anchors (#notes) can change the hash without clearing it. Writing with
// replaceState fires no event, so writes notify subscribers themselves.
const COUNTRY_PARAM = 'country';
const selectionListeners = new Set<() => void>();

export const subscribeSelection = (listener: () => void) => {
    selectionListeners.add(listener);
    window.addEventListener('popstate', listener);

    return () => {
        selectionListeners.delete(listener);
        window.removeEventListener('popstate', listener);
    };
};

export const readSelection = (): string =>
    (new URLSearchParams(window.location.search).get(COUNTRY_PARAM) ?? '').toUpperCase();

/** Writes the selection to the query string, keeping any hash; an empty code clears it. */
export const writeSelection = (iso3: string) => {
    const url = new URL(window.location.href);

    if (iso3 === '') {
        url.searchParams.delete(COUNTRY_PARAM);
    } else {
        url.searchParams.set(COUNTRY_PARAM, iso3);
    }

    window.history.replaceState(null, '', url);
    selectionListeners.forEach((listener) => listener());
};

/** A link that opens the page on one country. */
export const countryLink = (iso3: string): string => {
    const url = new URL(window.location.href);

    url.hash = '';
    url.searchParams.set(COUNTRY_PARAM, iso3);

    return url.toString();
};
