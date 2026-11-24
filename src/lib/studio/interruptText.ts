/**
 * The most characters the harness takes in an amendment or a free-text
 * answer on `/interrupt` (a longer one is refused 422 `string_too_long`).
 */
export const INTERRUPT_TEXT_MAX = 16_000;

/** The count appears once this few characters remain. */
export const INTERRUPT_COUNT_WITHIN = 1_000;

const COUNT_FROM = INTERRUPT_TEXT_MAX - INTERRUPT_COUNT_WITHIN;

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
    // Code points are never more than UTF-16 units, so a string whose
    // length is under the point where the count shows needs no spread.
    const count = text.length < COUNT_FROM ? text.length : [...text].length;

    return {
        count,
        show: count >= COUNT_FROM,
        over: count > INTERRUPT_TEXT_MAX,
    };
};

/** The message for a 422 `string_too_long` on `/interrupt`. */
export const TEXT_TOO_LONG_MESSAGE = `That text is over ${INTERRUPT_TEXT_MAX.toLocaleString('en-GB')} characters. Shorten it and send it again.`;

// The members of `/interrupt` that hold the user's words: an amendment
// (`payload`) and a free-text answer (`answers.<id>.text`).
const WORDS_FIELDS = ['payload', 'text'];

/**
 * Whether a harness 422 body names `string_too_long` on the user's words:
 * FastAPI's `detail` is a list of `{ type, loc, msg }` entries, and `loc`
 * runs from `body` down to the field.
 */
export const isTextTooLong = (status: number, body: unknown): boolean => {
    const detail = (body as { detail?: unknown } | null)?.detail;

    return (
        status === 422 &&
        Array.isArray(detail) &&
        detail.some((entry) => {
            const { type, loc } = (entry ?? {}) as { type?: unknown; loc?: unknown };

            return (
                type === 'string_too_long' &&
                Array.isArray(loc) &&
                WORDS_FIELDS.includes(String(loc.at(-1)))
            );
        })
    );
};
