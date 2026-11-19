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

/** A path on the site: a slash, then letters, digits and `_ - . : /`, up to
 *  the 300 characters POST /api/events keeps. The routes under src/app use
 *  fixed names plus dcids (/data/sources/<dcid>), doc slugs, gallery slugs,
 *  UUIDs (/studio/<id>) and share ids (/s/<id>, /embed/<id>), all within
 *  that set. Spaces, `@`, `,` and `%` escapes are refused, so text a visitor
 *  typed does not pass. The export keeps a page only when it matches
 *  (db/event-export.ts), and POST /api/events/data-view stores one only then. */
export const PAGE_PATH = /^\/[\w.:/-]{0,299}$/;
