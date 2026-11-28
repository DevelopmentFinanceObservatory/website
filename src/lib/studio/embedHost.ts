/*
 * An embed (/embed/<id>) framed by one of the site's own pages, which draws
 * the embed's foot itself: the Library's artifact page (LibraryArtifact's
 * ArtifactEmbed). The page asks for it with `?foot=host`. The embed then
 * leaves out its live strip and tells the page, as `dfo:embed-foot`, the
 * line the strip would show and whether it can photograph its card. The
 * page asks for the picture with `dfo:embed-image-request`, and the embed
 * writes the PNG (lib/studio/cardImage) and answers `dfo:embed-image-result`.
 * Both sides post only to the site's own origin and read only messages from
 * it, so a third-party page that frames an embed sees none of this.
 */

/** The query that has an embed leave its foot to the page framing it. */
export const EMBED_FOOT_PARAM = 'foot';
export const EMBED_FOOT_HOST = 'host';

/** The embed of share `id` for a page of the site that draws its foot. */
export const hostEmbedPath = (id: string): string =>
    `/embed/${encodeURIComponent(id)}?${EMBED_FOOT_PARAM}=${EMBED_FOOT_HOST}`;

export const EMBED_FOOT_MESSAGE = 'dfo:embed-foot';
export const EMBED_IMAGE_REQUEST = 'dfo:embed-image-request';
export const EMBED_IMAGE_RESULT = 'dfo:embed-image-result';

/** The embed's foot: the live line (null for a snapshot or a canvas with no
 *  data card) and whether Download image can photograph its card. */
export type EmbedFoot = { note: string | null; image: boolean };

const typed = (data: unknown, type: string): Record<string, unknown> | null =>
    typeof data === 'object' && data !== null && (data as Record<string, unknown>)['type'] === type
        ? (data as Record<string, unknown>)
        : null;

export const embedFootMessage = (foot: EmbedFoot) => ({ type: EMBED_FOOT_MESSAGE, ...foot });

/** The foot a message carries, or null when it is not a well-formed foot. */
export const readEmbedFoot = (data: unknown): EmbedFoot | null => {
    const message = typed(data, EMBED_FOOT_MESSAGE);
    const note = message?.['note'];
    const image = message?.['image'];

    return message && (note === null || typeof note === 'string') && typeof image === 'boolean'
        ? { note, image }
        : null;
};

export const embedImageRequest = () => ({ type: EMBED_IMAGE_REQUEST });

export const isEmbedImageRequest = (data: unknown): boolean =>
    typed(data, EMBED_IMAGE_REQUEST) !== null;

export const embedImageResult = (ok: boolean) => ({ type: EMBED_IMAGE_RESULT, ok });

/** Whether the picture was written, or null when the message is no result. */
export const readEmbedImageResult = (data: unknown): boolean | null => {
    const ok = typed(data, EMBED_IMAGE_RESULT)?.['ok'];

    return typeof ok === 'boolean' ? ok : null;
};

/** The height of the live strip an embed draws at its foot on any other
 *  page, in CSS pixels: `$note-strip` in EmbedView.module.scss. */
export const EMBED_LIVE_STRIP = 28;

const attribute = (value: string): string =>
    value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * The code that puts share `id` on another page: a full-width frame of
 * `height` CSS pixels with no border. The embed fills whatever height it is
 * given, so `height` is the one the content needs: Studio's Share dialog
 * gives 640, and the Library the height its own frame shows, plus the live
 * strip the embed draws there.
 */
export const embedSnippet = ({
    origin,
    id,
    title,
    height,
}: {
    origin: string;
    id: string;
    title: string;
    height: number;
}): string =>
    `<iframe src="${origin}/embed/${encodeURIComponent(id)}" width="100%" height="${Math.round(height)}" style="border:0" title="${attribute(title)}"></iframe>`;
