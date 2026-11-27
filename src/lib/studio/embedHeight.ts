/*
 * The height an embed (/embed/<id>) asks its host page for. The embed fills
 * whatever box its iframe gets, so it can only say when its content needs
 * more: it posts one message to its parent whenever its content overflows
 * the frame, and the site's own pages that frame it (LibraryArtifact's
 * EmbedFrame) grow the iframe to fit, within a range. A content that fits
 * posts nothing, so the host's own height stays in force, and a frame grown
 * to fit stops overflowing, so the size settles.
 */

/** The `type` of the message an embed posts to its parent. */
export const EMBED_HEIGHT_MESSAGE = 'dfo:embed-height';

export type EmbedHeightMessage = { type: typeof EMBED_HEIGHT_MESSAGE; height: number };

/** The range a host page holds a requested height to, in CSS pixels. A
 *  taller canvas pans inside the frame at the maximum. */
export const EMBED_HEIGHT_RANGE = { min: 240, max: 1600 };

/**
 * The frame height the embed's content needs, or null while it fits.
 * `scrollHeight` and `clientHeight` are the embed's scroll container's;
 * `viewportHeight` is the frame's, which also holds what sits outside that
 * container (the live strip, a horizontal scrollbar).
 */
export const neededEmbedHeight = ({
    scrollHeight,
    clientHeight,
    viewportHeight,
}: {
    scrollHeight: number;
    clientHeight: number;
    viewportHeight: number;
}): number | null =>
    scrollHeight > clientHeight ? Math.ceil(scrollHeight + viewportHeight - clientHeight) : null;

export const embedHeightMessage = (height: number): EmbedHeightMessage => ({
    type: EMBED_HEIGHT_MESSAGE,
    height,
});

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
