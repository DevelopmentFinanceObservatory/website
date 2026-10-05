/** The most one event's props may weigh as JSON; /api/events answers 413
 *  past it, so a stray payload can't bloat the table. The browser's search
 *  events are shaped to fit it (see lib/search/searchEvents). */
export const MAX_PROPS_BYTES = 8 * 1024;

/** The route's measure: the length of the props' JSON, in UTF-16 code units.
 *  /api/events and the search events' ladder both use it. */
export const fitsProps = (props: unknown): boolean =>
    JSON.stringify(props).length <= MAX_PROPS_BYTES;
