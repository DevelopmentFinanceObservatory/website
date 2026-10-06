/** Reads spec.identity.requested_window, what was actually requested and
 *  what an edit rewrites, not the engine's own resolved
 *  spec.resolution.requested_window, a distinct, untagged shape from the
 *  resolution trace. Only the identity field ever carries kind: 'all'. */

import type { IdentityWindow, TimeWindow } from './types.ts';

/** 'latest' has no row of its own. An open-ended "to latest" range is
 *  expressed as a range kind instead. */
export type WindowApplyValue = Extract<IdentityWindow, { kind: 'all' | 'range' }>;

/** The two year-input strings `WindowEditor` opens with. */
export interface WindowYearSeed {
    start: string;
    end: string;
}

const minOf = (years: number[]): number | undefined =>
    years.length ? Math.min(...years) : undefined;

const maxOf = (years: number[]): number | undefined =>
    years.length ? Math.max(...years) : undefined;

/** Per field: the engine's resolved coverage.window bound when it reports
 *  one. Otherwise, for a range request only, that field off requestedWindow
 *  (an omitted bound is a deliberate open end/start). Otherwise the clicked
 *  token's own rendered year or the shipped observation years. A range
 *  request stops at its own possibly-absent bound rather than falling back
 *  further, so a genuinely open bound seeds an empty string instead of a
 *  fabricated year. */
export function seedWindowYears({
    requestedWindow,
    coverageWindow,
    label,
    observationYears,
}: {
    requestedWindow: IdentityWindow | undefined;
    coverageWindow: TimeWindow | undefined;
    label: string | undefined;
    observationYears: number[];
}): WindowYearSeed {
    const range = requestedWindow?.kind === 'range' ? requestedWindow : undefined;
    const labelYears = (label?.match(/\d{4}/g) ?? []).map(Number);

    const fallbackStart = range ? undefined : (minOf(labelYears) ?? minOf(observationYears));
    const fallbackEnd = range ? undefined : (maxOf(labelYears) ?? maxOf(observationYears));

    const startYear = coverageWindow?.start_year ?? range?.start_year ?? fallbackStart;
    const endYear = coverageWindow?.end_year ?? range?.end_year ?? fallbackEnd;

    return {
        start: startYear === undefined ? '' : String(startYear),
        end: endYear === undefined ? '' : String(endYear),
    };
}

/** A direct read of requested_window, the same pattern the "Any provider"/"Any
 *  recipient" row's checked prop uses. */
export function isAllYearsWindow(requestedWindow: IdentityWindow | undefined): boolean {
    return requestedWindow?.kind === 'all';
}

/** `{kind: 'all'}`, in one named place so the "All years" row and this
 *  module's own tests share the exact literal it posts. */
export function allYearsApplyValue(): WindowApplyValue {
    return { kind: 'all' };
}

/** Null when neither input carries a year ("All years" is its own row for
 *  that). Reversed input is swapped back into order. A single filled field
 *  is never mirrored into the other, so a blank End with a filled Start
 *  posts an open end ("Latest"), not a single-year window. */
export function buildRangeApplyValue(start: string, end: string): WindowApplyValue | null {
    const parsedStart = parseInt(start, 10);
    const parsedEnd = parseInt(end, 10);
    const startYear = Number.isNaN(parsedStart) ? undefined : parsedStart;
    const endYear = Number.isNaN(parsedEnd) ? undefined : parsedEnd;

    if (startYear === undefined && endYear === undefined) return null;

    return startYear !== undefined && endYear !== undefined && startYear > endYear
        ? { kind: 'range', start_year: endYear, end_year: startYear }
        : { kind: 'range', start_year: startYear, end_year: endYear };
}

/** Whether posting `value` would just re-run the identical request already
 *  on `requestedWindow` — disables a dead Apply click. */
export function windowApplyValueUnchanged(
    value: WindowApplyValue,
    requestedWindow: IdentityWindow | undefined,
): boolean {
    if (value.kind === 'all') return requestedWindow?.kind === 'all';

    return (
        requestedWindow?.kind === 'range' &&
        requestedWindow.start_year === value.start_year &&
        requestedWindow.end_year === value.end_year
    );
}
