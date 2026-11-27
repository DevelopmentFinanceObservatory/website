/*
 * The height an embed (/embed/<id>) asks its host page for. The embed
 * measures its content's natural height: the height it takes with nothing
 * stretching it to fill the frame. It posts that height to its parent when
 * the content overflows the frame, and when the content is below the height
 * it last posted, so a host that follows it grows and shrinks with the
 * content. A content that fits and has posted nothing stays silent, so the
 * host's own height holds. The host asks for the height when it mounts and
 * when the frame loads, and the embed answers with the last height it
 * posted, or with the height its content needs when it overflows. The site's
 * own pages that frame an embed (LibraryArtifact's EmbedFrame) hold the
 * height to EMBED_HEIGHT_RANGE and keep their own height as the floor.
 */

/** The `type` of the message an embed posts to its parent. */
export const EMBED_HEIGHT_MESSAGE = 'dfo:embed-height';

/** The `type` of the message a host posts to its embed to ask for the height. */
export const EMBED_HEIGHT_REQUEST = 'dfo:embed-height-request';

export type EmbedHeightMessage = { type: typeof EMBED_HEIGHT_MESSAGE; height: number };

/** The range a host page holds a requested height to, in CSS pixels. A
 *  taller canvas pans inside the frame at the maximum. */
export const EMBED_HEIGHT_RANGE = { min: 240, max: 1600 };

/**
 * The frame height the embed's content takes. `contentBottom` is the bottom
 * edge of the content, measured from the top of the scroll container's
 * content with nothing stretching it; `clientHeight` is that container's
 * height. `viewportHeight` is the frame's, which also holds what sits outside
 * the container (the live strip, a horizontal scrollbar).
 */
export const naturalEmbedHeight = ({
    contentBottom,
    clientHeight,
    viewportHeight,
}: {
    contentBottom: number;
    clientHeight: number;
    viewportHeight: number;
}): number => Math.ceil(contentBottom + viewportHeight - clientHeight);

/**
 * The height to post, or null when there is nothing to say: the natural
 * height when the content overflows the frame, or when it is below the
 * height last posted (`sent`, null before the first).
 */
export const embedHeightToSend = ({
    natural,
    viewportHeight,
    sent,
}: {
    natural: number;
    viewportHeight: number;
    sent: number | null;
}): number | null => {
    if (natural === sent) {
        return null;
    }

    return natural > viewportHeight || (sent !== null && natural < sent) ? natural : null;
};

export const embedHeightMessage = (height: number): EmbedHeightMessage => ({
    type: EMBED_HEIGHT_MESSAGE,
    height,
});

export const embedHeightRequest = (): { type: typeof EMBED_HEIGHT_REQUEST } => ({
    type: EMBED_HEIGHT_REQUEST,
});

/** Whether a message is a host's request for the embed's height. */
export const isEmbedHeightRequest = (data: unknown): boolean =>
    typeof data === 'object' &&
    data !== null &&
    (data as Record<string, unknown>)['type'] === EMBED_HEIGHT_REQUEST;

/** The height a message asks for, or null when it is not an embed height
 *  message with a finite, positive height. */
export const readEmbedHeight = (data: unknown): number | null => {
    if (typeof data !== 'object' || data === null) {
        return null;
    }

    const { type, height } = data as Record<string, unknown>;

    if (type !== EMBED_HEIGHT_MESSAGE || typeof height !== 'number') {
        return null;
    }

    return Number.isFinite(height) && height > 0 ? height : null;
};

/** A requested height held to EMBED_HEIGHT_RANGE, in whole pixels. */
export const clampEmbedHeight = (height: number): number =>
    Math.round(Math.min(EMBED_HEIGHT_RANGE.max, Math.max(EMBED_HEIGHT_RANGE.min, height)));
