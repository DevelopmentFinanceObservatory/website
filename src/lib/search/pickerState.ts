/**
 * Pure decisions for the entity/place pickers: the shared filter-box
 * threshold (FILTER_VISIBLE_THRESHOLD), the provider/recipient seed+fetch merge
 * (streamed entity_options folded with the live entityOptions fetch), and
 * the coverage-ranking gate (a spec whose coverage probe was capped or timed
 * out skips richest-first ranking rather than floating an alphabetical
 * subset).
 */

import type { EntityOption } from './searchClient.ts';
import type { Coverage, Warning } from './types.ts';

/** Whichever shape an option arrived in: the engine's nested SlotOption
 *  (value.ref) or the flat client EntityOption (dcid/label). Exported so
 *  view.ts's splitCurrentPick<T> can bound its generic to it, rather than
 *  taking unconstrained options and forcing a cast here. */
export interface OptionLike {
    value?: { ref?: { dcid?: string; label?: string } };
    dcid?: string;
    label?: string;
    coverage?: Coverage | null;
}

/** About 8 rows fit before .slotMenuBody's scroll cap starts. Past that a
 *  filter box earns its keep. */
export const FILTER_VISIBLE_THRESHOLD = 8;

/** Whether a list this long earns a filter box at all. */
export function shouldShowOptionFilter(optionCount: number): boolean {
    return optionCount > FILTER_VISIBLE_THRESHOLD;
}

export function filterOptionsByQuery<T>(
    options: T[],
    query: string,
    getLabel: (option: T) => string,
): T[] {
    const needle = query.trim().toLowerCase();

    if (!needle) return options;

    return options.filter((option) => getLabel(option).toLowerCase().includes(needle));
}

/** Bridges the engine's nested SlotOption/EntityOptions shape
 *  (value.ref.dcid) and the flat client EntityOption shape (dcid). */
export function entityOptionDcid(option: OptionLike | null | undefined): string | undefined {
    return option?.value?.ref?.dcid ?? option?.dcid ?? undefined;
}

/** Null when an option carries neither dcid nor label. Dropped rather than
 *  shown half-filled. */
export function toEntityOption(option: OptionLike | null | undefined): EntityOption | null {
    const dcid = entityOptionDcid(option);
    const label = option?.value?.ref?.label ?? option?.label;

    if (!dcid || !label) return null;

    return { dcid, label, coverage: option?.coverage ?? undefined };
}

/** Merges the per-part menu's streamed seed with the door's own peers fetch,
 *  deduped by dcid: a shared dcid keeps the fetched (more complete) entry,
 *  and a seed-only dcid the fetch didn't return stays appended. Returns the
 *  seed alone while the live call is in flight, so there's something to
 *  render on first paint. */
export function mergeEntitySeedWithFetch(
    seed: OptionLike[],
    fetched: EntityOption[] | null,
): EntityOption[] {
    const seedNormalized = seed
        .map(toEntityOption)
        .filter((option): option is EntityOption => option !== null);

    if (!fetched) return seedNormalized;

    const merged: EntityOption[] = [];
    const seen = new Set<string>();

    for (const option of fetched) {
        if (seen.has(option.dcid)) continue;
        merged.push(option);
        seen.add(option.dcid);
    }

    for (const option of seedNormalized) {
        if (seen.has(option.dcid)) continue;
        merged.push(option);
        seen.add(option.dcid);
    }

    return merged;
}

const OPTION_COVERAGE_CAP_WARNING_CODES = new Set([
    'option_coverage_probe_failed',
    'option_coverage_timed_out',
]);

/** A list past the server-side coverage-probe cap is part covered, part
 *  null. Ranking it richest-first would float an alphabetical subset
 *  instead of a real ranking, so a caller skips ranking and renders the
 *  original order. Muting a confirmed no-data option still applies. */
export function optionCoverageRankingBlocked(
    warnings: Pick<Warning, 'code' | 'spec_id'>[] | undefined,
    specId: string | undefined,
): boolean {
    if (!warnings || !specId) return false;

    return warnings.some(
        (warning) =>
            warning.spec_id === specId && OPTION_COVERAGE_CAP_WARNING_CODES.has(warning.code),
    );
}

export function toggleDcid(selected: ReadonlySet<string>, dcid: string): Set<string> {
    const next = new Set(selected);

    if (next.has(dcid)) {
        next.delete(dcid);
    } else {
        next.add(dcid);
    }

    return next;
}

/** Order-irrelevant equality. A multi-select menu's Apply is disabled
 *  exactly when this holds between the pending selection and the
 *  currently-bound set. */
export function dcidSetsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
    if (a.size !== b.size) return false;

    for (const dcid of a) {
        if (!b.has(dcid)) return false;
    }

    return true;
}

/** A multi-select Apply's label: the pending count only when it differs
 *  from the bound set, so a long list's scrolled-away Apply still says what
 *  pressing it will do. A staged empty set ("Any provider") reads plain Apply,
 *  since a count of zero reads as nothing to apply. */
export const multiSelectApplyLabel = (selectedCount: number, disabled: boolean): string =>
    disabled || selectedCount === 0 ? 'Apply' : `Apply (${selectedCount})`;
