/**
 * What a Studio action on the search page hands to Studio: a question, and
 * a seed for each definite part. The question is the user's query until
 * they edit a part (a year, a place, a pick or a slot); from then on it is
 * the sentence on screen, so the question, the seeds and their operations
 * all describe the data the user sees.
 */

import type { Seed, SeedOperation } from '../studio/wire.ts';

import { unflattenSpec } from './searchClient.ts';
import { type HydratedPart, knownPart, type Operation } from './types.ts';

/** Whether the answer on screen may differ from the query's own reading: a
 *  part was edited, or the answer was opened from a share link, which stores
 *  each part's current identity and never the query that led to it. */
export function handoffEdited({
    editCount,
    fromShare,
}: {
    editCount: number;
    fromShare: boolean;
}): boolean {
    return editCount > 0 || fromShare;
}

/** The question Studio opens on: `sentence`, the sentence on screen without
 *  its notes, once any part was edited, and the query otherwise. */
export function handoffQuestion({
    query,
    edited,
    sentence,
}: {
    query: string;
    edited: boolean;
    sentence: string | null | undefined;
}): string {
    return (edited && sentence?.trim()) || query;
}

/**
 * One seed per definite part, in part order: the part's Spec block as the
 * Search API returned it, and the part's operations. A folded part shares
 * its representative's spec, so the two make one seed carrying the operations
 * of both. A spec with no definition, or one the site could not read,
 * would make Studio refuse the whole turn, so it is left out.
 */
export function handoffSeeds(parts: HydratedPart[]): Seed[] {
    const seeds = new Map<string, Seed>();

    for (const hydrated of parts) {
        const part = knownPart(hydrated.part);

        if (part?.status !== 'definite') {
            continue;
        }

        const block = unflattenSpec(part.spec);

        if (!block.definition || block.resolved.stat_vars_unreadable) {
            continue;
        }

        const seed: Seed = seeds.get(block.spec_id) ?? { spec: block, operations: [] };
        const known = new Set(seed.operations.map(operationKey));

        seed.operations.push(
            ...part.operations.filter(isSeedOperation).filter((op) => !known.has(operationKey(op))),
        );
        seeds.set(block.spec_id, seed);
    }

    return [...seeds.values()];
}

const SEED_VERBS: Record<SeedOperation['verb'], true> = {
    rank: true,
    aggregate: true,
    growth: true,
    share_of: true,
    explain: true,
    forecast: true,
    report: true,
};

const SEED_AXES: Record<NonNullable<SeedOperation['over']>, true> = {
    place: true,
    origin: true,
    destination: true,
    category: true,
    year: true,
};

/** True for an operation Studio reads: one whose verb and axis Studio's wire names. A verb or
 *  axis the Search API adds before Studio knows it stays out of the handoff. */
const isSeedOperation = (op: Operation): op is Operation & SeedOperation =>
    Object.hasOwn(SEED_VERBS, op.verb) && (op.over == null || Object.hasOwn(SEED_AXES, op.over));

const operationKey = ({ verb, phrase, over, target_year }: Operation): string =>
    JSON.stringify([verb, phrase, over ?? null, target_year ?? null]);

/** Studio's URL for a handoff: the question, and the token the seeds are
 *  stored under when there are any. */
export function studioHref(question: string, token: string | null): string {
    const params = new URLSearchParams({ q: question });

    if (token) {
        params.set('seed', token);
    }

    return `/studio?${params}`;
}
