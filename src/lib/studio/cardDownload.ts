/**
 * Download Data for a Studio card. A card's own rows come from the
 * Presentation API's export route, `GET /api/presentation/components/{id}/
 * revisions/{revision}/data?format=&bundle=`, through the site's proxy: every
 * frame row behind a value the card shows, as CSV, Excel or Parquet, zipped
 * with its README, `CITATION.cff` and `datapackage.json` unless `bundle` is
 * false.
 *
 * A card of a live share is drawn on current data, which the stored revision
 * does not hold. Its rows come from the share's own route,
 * `GET /api/share/{id}/cards/{cardId}/data?format=&bundle=`, which serves the
 * rows of the frame the card was last refreshed on.
 */

import type { CardRef, Widget } from '../chat/widgets.ts';
import type { DatasetFormat } from '../search/searchClient.ts';

export type CardDataOptions = { format: DatasetFormat; bundle: boolean };

/** The revision a card's Download Data exports, or null for a text card and
 *  a card saved before cards kept their revision. */
export const cardRefOf = (widget: Widget): CardRef | null =>
    (widget.kind !== 'text' && widget.ref) || null;

/** component_id → the revision each card draws: what a card-scoped turn
 *  addresses after a saved conversation is reopened. */
export const cardRevisions = (widgets: Widget[]): Map<string, number> =>
    new Map(
        widgets.flatMap((widget) => {
            const ref = cardRefOf(widget);

            return ref ? [[ref.component_id, ref.revision] as const] : [];
        }),
    );

/** Restore only the refs known to the saved session. Legacy saves use their cards. */
export const restoreCardRevisions = (saved?: {
    sessionId: string | null;
    widgets: Widget[];
    componentRefs?: CardRef[];
}): Map<string, number> => {
    if (!saved?.sessionId) {
        return new Map();
    }

    return saved.componentRefs
        ? new Map(saved.componentRefs.map((ref) => [ref.component_id, ref.revision]))
        : cardRevisions(saved.widgets);
};

const componentDataPath = (componentId: string, revision: string | number): string =>
    `/api/presentation/components/${encodeURIComponent(componentId)}/revisions/${encodeURIComponent(String(revision))}/data`;

/** A card of a live share, as its data route names it. */
export type LiveCardAddress = { shareId: string; cardId: string };

const dataQuery = ({ format, bundle }: CardDataOptions): string =>
    String(new URLSearchParams({ format, bundle: String(bundle) }));

/** The site's proxy URL for one revision's rows. */
export const cardDataUrl = (ref: CardRef, options: CardDataOptions): string =>
    `${componentDataPath(ref.component_id, ref.revision)}?${dataQuery(options)}`;

/** The share route for a live card's refreshed rows. */
export const liveCardDataUrl = (
    { shareId, cardId }: LiveCardAddress,
    options: CardDataOptions,
): string =>
    `/api/share/${encodeURIComponent(shareId)}/cards/${encodeURIComponent(cardId)}/data?${dataQuery(options)}`;

/** The export route the proxy forwards to; `search` is the caller's query
 *  string, passed as it came. */
export const componentDataTarget = (
    base: string,
    componentId: string,
    revision: string,
    search: string,
): string => `${base}${componentDataPath(componentId, revision)}${search}`;

/** The name a `Content-Disposition: attachment; filename="…"` header gives,
 *  or `fallback` when it gives none. */
export const attachmentName = (header: string | null, fallback: string): string =>
    header?.match(/filename="([^"]+)"/)?.[1] ?? fallback;

// The export route's refusals, in the user's terms.
const REFUSALS: Record<string, string> = {
    not_found: 'This card has no rows to download.',
    frame_unavailable: 'The data behind this card is no longer available.',
    request_invalid:
        "This card's data cannot be written as Excel. Download it as CSV or Parquet instead.",
    internal_error: 'The file did not match the card, so it was not served. Try again later.',
    live_unavailable: 'Live data is unavailable for this link.',
    // slotCards.ts LIVE_FILE_UNAVAILABLE: a bundle or Excel file of a card on newer data.
    live_file_unavailable:
        'On current data this card downloads as CSV or Parquet, without the README and citation.',
    backend_timeout: 'The data took too long to prepare. Try again.',
    unauthorized: 'Live data is unavailable for this link.',
    refresh_not_configured: 'Live data is unavailable for this link.',
};

/** The code of a live card's download that waits on a refresh in progress
 *  (the share route's 503). */
export const DOWNLOAD_PENDING = 'refresh_pending';

/** The sentence shown when a card's download fails, by refusal code.
 *  `retryAfterS` is the wait a `DOWNLOAD_PENDING` answer named. */
export const cardDownloadMessage = (code: string | null, retryAfterS?: number | null): string => {
    if (code === DOWNLOAD_PENDING) {
        return retryAfterS
            ? `Current data is still being prepared. Try again in ${retryAfterS} seconds.`
            : 'Current data is still being prepared. Try again shortly.';
    }

    return (code && REFUSALS[code]) || 'Download unavailable right now. Try again.';
};

/** A refused download, with the route's machine-readable code and, for
 *  `DOWNLOAD_PENDING`, the seconds the route asked the caller to wait. */
export class CardDownloadError extends Error {
    readonly code: string | null;

    readonly retryAfterS: number | null;

    constructor(code: string | null, retryAfterS: number | null = null) {
        super(cardDownloadMessage(code, retryAfterS));
        this.name = 'CardDownloadError';
        this.code = code;
        this.retryAfterS = retryAfterS;
    }
}

const extensionOf = ({ format, bundle }: CardDataOptions): string => (bundle ? 'zip' : format);

const wholeSeconds = (value: unknown): number | null => {
    const seconds = Number(value);

    return value !== null && value !== '' && Number.isFinite(seconds) && seconds > 0
        ? Math.ceil(seconds)
        : null;
};

// The share route's answer when it serves no file is a problem document: 503
// `refresh_pending` while a refresh is in progress (the wait in `Retry-After`
// and the document's `retry_after_s`), and otherwise its `code`.
const liveRefusal = (res: Response, body: Record<string, unknown> | null): CardDownloadError => {
    const code = body?.['code'];

    if (res.status === 503 && code === DOWNLOAD_PENDING) {
        return new CardDownloadError(
            DOWNLOAD_PENDING,
            wholeSeconds(res.headers.get('retry-after')) ?? wholeSeconds(body?.['retry_after_s']),
        );
    }

    return new CardDownloadError(typeof code === 'string' ? code : null);
};

/**
 * Fetch a card's rows as a file: the rows of revision `ref`, or, when `live`
 * names the card on a live share, the rows the share last refreshed it on.
 * The file is read whole, since a card is capped at 24 series of 500 points
 * or 2,000 table rows. Any answer but a served file throws
 * `CardDownloadError`, so a refusal's body cannot be saved as the file.
 */
export const fetchCardData = async (
    ref: CardRef,
    options: CardDataOptions,
    { live, signal }: { live?: LiveCardAddress | null; signal?: AbortSignal } = {},
): Promise<{ blob: Blob; fileName: string }> => {
    const res = await fetch(live ? liveCardDataUrl(live, options) : cardDataUrl(ref, options), {
        signal,
    });

    if (!res.ok) {
        const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;

        if (live) {
            throw liveRefusal(res, body);
        }

        throw new CardDownloadError(typeof body?.['code'] === 'string' ? body['code'] : null);
    }

    return {
        blob: await res.blob(),
        fileName: attachmentName(
            res.headers.get('content-disposition'),
            `${ref.component_id}.r${ref.revision}.${extensionOf(options)}`,
        ),
    };
};
