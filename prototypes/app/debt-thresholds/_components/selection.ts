// A link opens the page on one country through the query string (?country=KEN). A pick
// on the page stays in component state and leaves the URL alone: the site's GA4 tag
// counts every history change as a page view, so rewriting the query on each pick would
// count one visit many times. The card's copy-link button gives the URL for a country.
const COUNTRY_PARAM = 'country';

const noSubscribe = () => () => {};

/** The country the URL opened the page on, upper-cased, or '' for none. */
const readUrlSelection = (): string =>
    (new URLSearchParams(window.location.search).get(COUNTRY_PARAM) ?? '').toUpperCase();

/** The URL's country as an external store, '' during prerender. */
export const urlSelectionStore = [noSubscribe, readUrlSelection, () => ''] as const;

/** A link that opens the page on one country. */
export const countryLink = (iso3: string): string => {
    const url = new URL(window.location.href);

    url.hash = '';
    url.searchParams.set(COUNTRY_PARAM, iso3);

    return url.toString();
};
