/**
 * The most characters the harness takes in an amendment or a free-text
 * answer on `/interrupt` (a longer one is refused 422 `string_too_long`).
 */
export const INTERRUPT_TEXT_MAX = 16_000;

/** The count appears once this few characters remain. */
export const INTERRUPT_COUNT_WITHIN = 1_000;

export type InterruptTextCount = {
    /** Characters in the text, counted as the harness counts them (code points). */
    count: number;
    /** Whether the count shows: near the limit or past it. */
    show: boolean;
    /** Whether the text is past the limit and may not be sent. */
    over: boolean;
};

/** The count of `text` against the limit, and what the field shows for it. */
export const interruptTextCount = (text: string): InterruptTextCount => {
    // A string this short cannot hold more code points than the limit
    // allows, so the common case skips the spread.
    const count = text.length <= INTERRUPT_TEXT_MAX ? text.length : [...text].length;

    return {
        count,
        show: count >= INTERRUPT_TEXT_MAX - INTERRUPT_COUNT_WITHIN,
        over: count > INTERRUPT_TEXT_MAX,
    };
};

/** The message for a 422 `string_too_long` on `/interrupt`. */
export const TEXT_TOO_LONG_MESSAGE = `That text is over ${INTERRUPT_TEXT_MAX.toLocaleString('en-GB')} characters. Shorten it and send it again.`;

/**
 * Whether a harness 422 body names `string_too_long`: FastAPI's `detail` is a
 * list of `{ type, loc, msg }` entries.
 */
export const isTextTooLong = (status: number, body: unknown): boolean => {
    const detail = (body as { detail?: unknown } | null)?.detail;

    return (
        status === 422 &&
        Array.isArray(detail) &&
        detail.some((entry) => (entry as { type?: unknown } | null)?.type === 'string_too_long')
    );
};
