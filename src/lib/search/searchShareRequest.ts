/* eslint-disable @typescript-eslint/no-explicit-any -- request bodies are validated field by field below */
import type { Operation } from './types.ts';

/**
 * The shape and limits of a search share request, checked before any
 * platform call. Like `snapshot.ts`, this module has no database or
 * path-alias dependency, so `node --test` imports it directly.
 */

export type SearchShareMode = 'live' | 'snapshot';

const MODES: SearchShareMode[] = ['live', 'snapshot'];

/** One definite part of the result being shared, as the page holds it. */
export type SearchSharePart = {
    partIndex: number;
    variableText: string | null;
    specId: string;
    identity: unknown;
    // What the question asked of the part beyond its data. The replay
    // carries them back.
    operations: Operation[];
    // The canonical definition from the resolve response, which register
    // and mint take. Not stored, since the identity is enough to replay.
    definition: unknown;
};

const SPEC_SHAPE = /^spec_[a-z0-9]+$/;

export const isSearchSharePart = (value: any): value is SearchSharePart =>
    !!value &&
    typeof value === 'object' &&
    Number.isInteger(value.partIndex) &&
    typeof value.specId === 'string' &&
    SPEC_SHAPE.test(value.specId) &&
    !!value.identity &&
    typeof value.identity === 'object' &&
    Array.isArray(value.operations) &&
    !!value.definition &&
    typeof value.definition === 'object';

/**
 * The most parts one search share holds. Matches Search's `SEARCH_MAX_PARTS`,
 * the most parts a result carries, so a larger request cannot have come from
 * the page.
 */
export const SEARCH_SHARE_MAX_PARTS = 6;

export type SearchShareRequest = {
    mode: SearchShareMode;
    query: string;
    parts: SearchSharePart[];
};

/** The request a body describes, or null when the share route should answer 400. */
export const readSearchShareRequest = (body: any): SearchShareRequest | null => {
    const parts = Array.isArray(body?.parts) ? body.parts : [];
    const query = typeof body?.query === 'string' ? body.query.trim().slice(0, 500) : '';

    if (
        !MODES.includes(body?.mode) ||
        !query ||
        parts.length === 0 ||
        parts.length > SEARCH_SHARE_MAX_PARTS ||
        !parts.every(isSearchSharePart)
    ) {
        return null;
    }

    return { mode: body.mode, query, parts };
};
