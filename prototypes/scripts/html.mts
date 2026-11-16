// HTML entity decoding for check:dist, kept apart so a test can import it.

// The entities React writes into an attribute value.
const ENTITIES: Record<string, string> = {
    amp: '&',
    quot: '"',
    lt: '<',
    gt: '>',
    '#x27': "'",
    '#39': "'",
};

/** Decodes the entities in an attribute value in one pass, so the text an
 *  entity produces is never decoded again: `&amp;quot;` reads as `&quot;`. */
export const decodeEntities = (value: string): string =>
    value.replace(/&(amp|quot|lt|gt|#x27|#39);/g, (_match, name: string) => ENTITIES[name]);
