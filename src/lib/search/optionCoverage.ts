/**
 * optionCoverage — shared rank-and-demote logic for coverage-annotated option
 * lists. Ported from dfo-dcp's prototype (custom_dc/dfo/prototypes/lib/
 * optionCoverage.ts), keeping only the three exports this site's `SlotOption`
 * (types.ts) needs: it always carries the engine's own `Coverage` shape
 * directly, never the flattened `{coverage?, count?}` shape dfo-dcp's own
 * SlotOptionsProvider produces, so the adapter functions built for that
 * flattened shape (`countState`/`optionState`/`optionRichness`) have no
 * counterpart here.
 *
 * A `SlotOption.coverage` falls into three states:
 *   - 'observed'    the probe ran and found data
 *   - 'probed-zero' the probe ran and confirmed no data for this slice
 *   - 'unknown'     never probed (include_option_coverage was off), or this
 *                    option carries no coverage for another reason
 * The engine never fabricates a verdict for the third case — coverage stays
 * absent rather than reported as zero, so it must never be treated as
 * "no data" here either.
 *
 * partitionOptions groups a list into `main` (observed, richest-first, then
 * unknown in original relative order, plus a pinned current pick even when
 * probed-zero) and `hidden` (every other probed-zero option) for a
 * caller-side ranking. A list with no probed verdicts at all passes through
 * unchanged (today's order and behavior).
 */

import type { Coverage } from './types';

export type CoverageState = 'observed' | 'probed-zero' | 'unknown';

/** State for an engine SlotOption.coverage: absent means never probed,
 *  has_data:false means the probe ran and confirmed nothing, otherwise
 *  observed. */
export function coverageState(coverage: Coverage | null | undefined): CoverageState {
    if (!coverage) return 'unknown';
    return coverage.has_data === false ? 'probed-zero' : 'observed';
}

/** Richness key for a SlotOption.coverage, compared lexicographically
 *  (higher first): `dimensions`, in the engine's fixed [facet_count,
 *  obs_count] order when present (a 'breadth' coverage always carries them;
 *  an 'exact' one only sometimes), else `observation_count` ('exact' only),
 *  else 0 (e.g. a bare has_data:true with neither). */
export function coverageRichness(coverage: Coverage | null | undefined): number[] {
    if (!coverage) return [0];

    const dims = 'dimensions' in coverage ? (coverage.dimensions ?? []) : [];

    if (dims.length) return dims.map((d) => d.count ?? 0);
    if ('observation_count' in coverage && coverage.observation_count != null) {
        return [coverage.observation_count];
    }

    return [0];
}

export interface CoverageAccessors<T> {
    state(item: T): CoverageState;
    /** Compared lexicographically, higher first. */
    richness(item: T): number[];
    label(item: T): string;
    /** The currently-bound option: stays in `main` even when probed-zero (rule: a
     *  user's existing selection must never vanish from view). */
    isPinned(item: T): boolean;
}

export interface PartitionedOptions<T> {
    main: T[];
    hidden: T[];
}

function compareRichnessDesc(a: number[], b: number[]): number {
    const len = Math.max(a.length, b.length);

    for (let i = 0; i < len; i++) {
        const diff = (b[i] ?? 0) - (a[i] ?? 0);

        if (diff !== 0) return diff;
    }

    return 0;
}

export function partitionOptions<T>(items: T[], accessors: CoverageAccessors<T>): PartitionedOptions<T> {
    // No option carries a probed verdict at all -- leave order/behavior untouched.
    if (!items.some((item) => accessors.state(item) !== 'unknown')) {
        return { main: items, hidden: [] };
    }

    const observed: T[] = [];
    const unknown: T[] = [];
    const hidden: T[] = [];
    const pinnedZero: T[] = [];

    for (const item of items) {
        const state = accessors.state(item);

        if (state === 'observed') observed.push(item);
        else if (state === 'unknown') unknown.push(item);
        else if (accessors.isPinned(item)) pinnedZero.push(item);
        else hidden.push(item);
    }

    observed.sort(
        (a, b) =>
            compareRichnessDesc(accessors.richness(a), accessors.richness(b)) ||
            accessors.label(a).localeCompare(accessors.label(b)),
    );

    return { main: [...observed, ...pinnedZero, ...unknown], hidden };
}
