/**
 * Download Data for a Studio card. A card's own rows come from the
 * Presentation API's export route, `GET /api/presentation/components/{id}/
 * revisions/{revision}/data?format=&bundle=`, through the site's proxy: every
 * frame row behind a value the card shows, as CSV, Excel or Parquet, zipped
 * with its README, `CITATION.cff` and `datapackage.json` unless `bundle` is
 * false.
 */

import type { CardRef, Widget } from '../chat/widgets.ts';
import type { DatasetFormat } from '../search/searchClient.ts';

export type CardDataOptions = { format: DatasetFormat; bundle: boolean };

/** The revision a card's Download Data exports, or null for a text card and
 *  a card saved before cards kept their revision. */
export const cardRefOf = (widget: Widget): CardRef | null =>
    (widget.kind !== 'text' && widget.ref) || null;

const componentDataPath = (componentId: string, revision: string | number): string =>
    `/api/presentation/components/${encodeURIComponent(componentId)}/revisions/${encodeURIComponent(String(revision))}/data`;

/** The site's proxy URL for one revision's rows. */
export const cardDataUrl = (ref: CardRef, { format, bundle }: CardDataOptions): string =>
    `${componentDataPath(ref.component_id, ref.revision)}?${new URLSearchParams({
        format,
        bundle: String(bundle),
    })}`;

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
};

/** The sentence shown when a card's download fails, by refusal code. */
export const cardDownloadMessage = (code: string | null): string =>
    (code && REFUSALS[code]) || 'Download unavailable right now. Try again.';

/** A refused download, with the export route's machine-readable code. */
export class CardDownloadError extends Error {
    readonly code: string | null;

    constructor(code: string | null) {
        super(cardDownloadMessage(code));
        this.name = 'CardDownloadError';
        this.code = code;
    }
}

const extensionOf = ({ format, bundle }: CardDataOptions): string => (bundle ? 'zip' : format);

/**
 * Fetch one revision's rows as a file. The file is read whole: a card is
 * capped at 24 series of 500 points or 2,000 table rows, so it is small.
 * Throws `CardDownloadError` on a refusal.
 */
export const fetchCardData = async (
    ref: CardRef,
    options: CardDataOptions,
    signal?: AbortSignal,
): Promise<{ blob: Blob; fileName: string }> => {
    const res = await fetch(cardDataUrl(ref, options), { signal });

    if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { code?: unknown } | null;

        throw new CardDownloadError(typeof body?.code === 'string' ? body.code : null);
    }

    return {
        blob: await res.blob(),
        fileName: attachmentName(
            res.headers.get('content-disposition'),
            `${ref.component_id}.r${ref.revision}.${extensionOf(options)}`,
        ),
    };
};
