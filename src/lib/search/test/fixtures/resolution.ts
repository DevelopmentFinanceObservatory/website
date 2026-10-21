import { normalizeResponse } from '../../searchClient.ts';
import { knownPart, type Part, type Resolution } from '../../types.ts';

/** A resolve body normalised as the page reads it. Throws when the body is a
 *  catalogue or declined answer, so a test that expects a resolution fails
 *  at the fixture instead of on a missing `parts`. */
export function resolution(body: unknown): Resolution {
    const response = normalizeResponse(body);

    if (response.kind !== 'resolution') {
        throw new Error(`expected a resolution body, got kind "${response.kind}"`);
    }
    return response;
}

const statusError = (expected: string, part: Part | null | undefined) =>
    new Error(`expected a ${expected} part, got ${part ? `"${part.status}"` : 'none'}`);

/** `part` as a definite part; throws for any other status. */
export function definite(part: Part | null | undefined) {
    const known = knownPart(part);

    if (known?.status !== 'definite') throw statusError('definite', part);
    return known;
}

/** `part` as a candidates part; throws for any other status. */
export function candidates(part: Part | null | undefined) {
    const known = knownPart(part);

    if (known?.status !== 'candidates') throw statusError('candidates', part);
    return known;
}

/** `part` as a no_data part; throws for any other status. */
export function noData(part: Part | null | undefined) {
    const known = knownPart(part);

    if (known?.status !== 'no_data') throw statusError('no_data', part);
    return known;
}
