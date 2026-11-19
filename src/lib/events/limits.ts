/** The most one event's props may weigh as JSON; /api/events answers 413
 *  past it, so a stray payload can't bloat the table. The browser's search
 *  events are shaped to fit it (see lib/search/searchEvents). */
export const MAX_PROPS_BYTES = 8 * 1024;

/** The route's measure: the length of the props' JSON, in UTF-16 code units.
 *  /api/events and the search events' ladder both use it. */
export const fitsProps = (props: unknown): boolean =>
    JSON.stringify(props).length <= MAX_PROPS_BYTES;

/** The most ids a list prop carries (`measures`, `specIds`).
 *  The export keeps a list prop only up to this length (db/event-export.ts). */
export const MAX_LIST_IDS = 10;

/** What a list prop holds in place of a part that has no id to give, so two
 *  parallel lists (`specIds`, `measures`) stay one entry per part and zip. */
export const NO_ID = '-';

/** What a `token`, a `digest` or one entry of a list prop must match for the
 *  export to keep it (db/event-export.ts). `|` joins the members of a
 *  `measures` token; a Data Commons dcid has `/` but no `|`. */
export const TOKEN_PATTERN = /^[A-Za-z0-9][\w.:/|-]{0,127}$/;
