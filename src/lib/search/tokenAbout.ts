/* eslint-disable @typescript-eslint/no-explicit-any -- reads the same shallow Spec the sentence menus read (see lib/search/types.ts for the full mirror) */
/**
 * The About line at the top of a sentence token's panel: what the token's
 * current value is, read from the Spec the answer already carries. The line
 * holds the value's name and its short facts (a measure's unit, span and
 * download rows, a place's type, a unit's currency). The longer text (the
 * graph's definitions, a source's description, a unit's price basis
 * explained) waits behind the line's info mark. The definitions are read by
 * dcid as the block mounts, so this module names the nodes and the
 * component reads their text.
 */

import { keyRef } from './searchClient.ts';
import type { EntityRoleKey, SentenceToken, UnitConversion } from './types.ts';
import { priceBasis } from './unitLabel.ts';
import type { PriceBasis } from './unitLabel.ts';
import {
    axisLabel,
    formatCount,
    formatWindow,
    provenanceOrigin,
    rowsLabel,
    servedSeriesCount,
    specUnit,
} from './view.ts';

/** A graph node whose definition the info note shows, under `label` when
 *  the label adds to the line's title (an axis value, one of several
 *  codes). */
export type AboutDefinition = { label: string | null; dcid: string };

/** A source the block describes: its name and publisher here, its
 *  description and Sources-page link from `/api/source-doc/{dcid}`. */
export type AboutSource = { dcid: string; label: string; origin: string | null };

export type TokenAboutKind = 'measure' | 'entity' | 'period' | 'code' | 'unit' | 'source';

export type TokenAboutModel = {
    kind: TokenAboutKind;
    /** the current value, as a reader names it */
    title: string;
    /** short facts the line states after the title */
    facts: string[];
    /** longer lines the info note shows above the definitions */
    notes: string[];
    definitions: AboutDefinition[];
    sources: AboutSource[];
};

// A group whose node is a continent or UN subregion holds the countries and
// territories inside it, so its members are named as places.
const REGION_GROUP_TYPES: ReadonlySet<string> = new Set(['Continent', 'UNGeoRegion']);

const sentenceCase = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

// "AdministrativeArea1" → "Administrative area 1".
const typeWords = (type: string): string =>
    sentenceCase(
        type
            .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
            .toLowerCase(),
    );

const dimensionCount = (spec: any, label: string): number | null =>
    (spec?.coverage?.dimensions ?? []).find((dimension: any) => dimension?.label === label)
        ?.count ?? null;

const yearOf = (date: unknown): string | null =>
    typeof date === 'string' && date.length >= 4 ? date.slice(0, 4) : null;

const span = (start: string | null, end: string | null): string | null =>
    start && end ? (start === end ? start : `${start} to ${end}`) : null;

/** The years the served data spans: the coverage window, else the Spec's
 *  `stat_vars.data_date_range` over its served StatVars. */
export const servedSpan = (spec: any): string | null => {
    const covered = formatWindow(spec?.coverage?.window);

    if (covered) return covered;

    const range = spec?.stat_vars?.data_date_range;

    return span(yearOf(range?.start), yearOf(range?.end));
};

/** The latest date with data: the newer of the served StatVars' range end
 *  and the observation points that hold a value. The range spans every
 *  year; the points are a preview of a few series, so they only add a
 *  date when the range is missing or stops short of them. */
export const latestDate = (spec: any): string | null => {
    const end: unknown = spec?.stat_vars?.data_date_range?.end;
    const ends: string[] = typeof end === 'string' && end ? [end] : [];
    const points: string[] = (spec?.observations?.series ?? []).flatMap((series: any) =>
        (series?.points ?? [])
            .filter((point: any) => point?.value != null)
            .map((point: any) => point.date),
    );

    return [...ends, ...points].toSorted().at(-1) ?? null;
};

/** Why the measure serves several series: the axes on which the served
 *  series differ ("One series for each sector, instrument and modality
 *  combination."). Null when no axis is known to vary. */
export const seriesReason = (spec: any): string | null => {
    const axes: string[] = (spec?.open_axis_facts ?? [])
        .filter((fact: any) => fact?.varies && typeof fact.property === 'string')
        .map((fact: any) => axisLabel(spec, fact.property));

    if (axes.length === 0) return null;

    const list = new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(axes);

    return `One series for each ${list}${axes.length > 1 ? ' combination' : ''}.`;
};

/** The Spec whose members a measure's About reads from the members door
 *  (`useDefinitionMembers`) to define its one StatVar: the Spec itself when
 *  the answer serves one StatVar, else null. */
export const singleStatVarSpec = (spec: any): any =>
    spec && servedSeriesCount(spec) === 1 ? spec : null;

// A measure's About leaves out the axis values another visible token
// states (`statedElsewhere`, refs such as "axis:measurementQualifier" the
// unit token states), since that token's own panel describes them.
const measureAbout = (
    token: SentenceToken,
    spec: any,
    statedElsewhere: ReadonlySet<string>,
): TokenAboutModel => {
    const count = servedSeriesCount(spec);
    const facts = [
        specUnit(spec),
        servedSpan(spec),
        rowsLabel(spec?.download?.rows, spec?.download?.rows_exact),
    ].filter((fact): fact is string => !!fact);
    const reason = count != null && count > 1 ? seriesReason(spec) : null;
    const values: AboutDefinition[] = (spec?.measure_axis_values ?? [])
        .filter((entry: any) => entry?.value?.dcid && !statedElsewhere.has(`axis:${entry.axis}`))
        .map((entry: any) => ({
            label: sentenceCase(entry.value.label ?? entry.value.dcid),
            dcid: entry.value.dcid,
        }));
    const name = spec?.measure_label ?? token.text;

    return {
        kind: 'measure',
        title: sentenceCase(name.trim()),
        facts,
        notes: reason ? [reason] : [],
        definitions: values,
        sources: [],
    };
};

const ROLE_NOUNS: Record<EntityRoleKey, { one: string; many: string; dimensions: string[] }> = {
    origin: { one: 'provider', many: 'providers', dimensions: ['providers'] },
    destination: { one: 'recipient', many: 'recipients', dimensions: ['recipients'] },
    observationAbout: { one: 'place', many: 'places', dimensions: ['countries', 'places'] },
};

// The names a long member list shows before counting the rest.
const LISTED_MEMBERS = 8;

const listNames = (names: string[]): string =>
    names.length > LISTED_MEMBERS
        ? `${names.slice(0, LISTED_MEMBERS).join(', ')} and ${formatCount(names.length - LISTED_MEMBERS)} more`
        : names.join(', ');

const entityAbout = (token: SentenceToken, spec: any): TokenAboutModel => {
    const role: EntityRoleKey = token.role ?? 'observationAbout';
    const nouns = ROLE_NOUNS[role];
    const entities: any[] = spec?.entities ?? [];
    const dcids: string[] = token.entity_refs?.length
        ? token.entity_refs
        : entities.filter((entity) => entity?.role === role).map((entity) => entity.ref);
    const byDcid = new Map(entities.map((entity) => [entity?.ref, entity]));
    const group = spec?.entity_groups?.[role] ?? null;

    if (dcids.length === 0) {
        const withData =
            nouns.dimensions.map((label) => dimensionCount(spec, label)).find((n) => n != null) ??
            null;

        const title = token.text.trim() || `Any ${nouns.one}`;
        // The engine's open-role text ("154 recipients") already states the
        // count, so the fact repeats it only under a title that does not.
        const count =
            withData != null && !title.includes(formatCount(withData))
                ? `: ${formatCount(withData)} ${withData === 1 ? nouns.one : nouns.many}`
                : '';

        return {
            kind: 'entity',
            title,
            facts: [`Every ${nouns.one} with data${count}`],
            notes: [],
            definitions: [],
            sources: [],
        };
    }

    const names = dcids.map((dcid) => byDcid.get(dcid)?.label ?? dcid);
    const types = [
        ...new Set(dcids.map((dcid) => byDcid.get(dcid)?.entity_type).filter(Boolean)),
    ].map(typeWords);
    const typeFact = types.length > 0 ? types.join(', ') : null;

    if (group) {
        const count = formatCount(dcids.length);
        const fact = REGION_GROUP_TYPES.has(group.entity_type)
            ? `${count} ${dcids.length === 1 ? 'country or territory' : 'countries and territories'}`
            : `Group of ${count} ${dcids.length === 1 ? 'member' : 'members'}${typeFact ? ` (${typeFact.toLowerCase()})` : ''}`;

        return {
            kind: 'entity',
            title: group.label,
            facts: [fact],
            notes: [listNames(names)],
            definitions: group.dcid ? [{ label: null, dcid: group.dcid }] : [],
            sources: [],
        };
    }

    if (dcids.length === 1) {
        return {
            kind: 'entity',
            title: names[0] === dcids[0] ? token.text.trim() || names[0] : names[0],
            facts: typeFact ? [typeFact] : [],
            notes: [],
            definitions: [{ label: null, dcid: dcids[0] }],
            sources: [],
        };
    }

    return {
        kind: 'entity',
        title: token.text.trim(),
        facts: [
            `${formatCount(dcids.length)} ${nouns.many}${typeFact ? ` (${typeFact.toLowerCase()})` : ''}`,
        ],
        notes: [listNames(names)],
        definitions: [],
        sources: [],
    };
};

const periodAbout = (token: SentenceToken, spec: any): TokenAboutModel => {
    const title = token.text.trim();
    const served = servedSpan(spec);
    const latest = latestDate(spec);

    return {
        kind: 'period',
        title,
        facts: [
            served && served !== title ? `Data served: ${served}` : null,
            latest ? `Latest data: ${latest}` : null,
        ].filter((fact): fact is string => !!fact),
        notes: [],
        definitions: [],
        sources: [],
    };
};

const codeAbout = (token: SentenceToken, spec: any): TokenAboutModel => {
    const slot = (spec?.slots ?? []).find((s: any) => keyRef(s.key) === token.binding_ref);
    const binding = slot?.binding;
    const refs: any[] =
        binding?.kind === 'value'
            ? [binding.value?.ref]
            : binding?.kind === 'set'
              ? (binding.values ?? []).map((value: any) => value?.ref)
              : [];
    const codes = refs.filter((ref) => typeof ref?.dcid === 'string');

    return {
        kind: 'code',
        title: token.text.trim(),
        facts: slot?.key?.label ? [sentenceCase(slot.key.label)] : [],
        notes: [],
        definitions: codes.map((ref) => ({
            label: codes.length > 1 ? (ref.label ?? ref.dcid) : null,
            dcid: ref.dcid,
        })),
        sources: [],
    };
};

const priceBasisWords = (basis: PriceBasis): string =>
    basis.prices === 'current'
        ? 'Current prices: each value in the money of its own year, not adjusted for inflation.'
        : `Constant ${basis.baseYear ? `${basis.baseYear} ` : ''}prices: values adjusted for inflation${basis.baseYear ? ` to ${basis.baseYear} prices` : ''}, so years compare.`;

/** The noun the answer's conversion offer names `code` by ("euros"), else
 *  the runtime's name for it ("Japanese Yen"), else the code. */
export const currencyName = (code: string, conversion: UnitConversion | null): string => {
    const noun = conversion?.currencies.find((currency) => currency.code === code)?.noun;

    if (noun) return noun;

    try {
        return new Intl.DisplayNames('en-GB', { type: 'currency' }).of(code) ?? code;
    } catch {
        return code;
    }
};

/** The exchange-rate and deflator tables behind the converted series, one
 *  line per table, each named once. */
const conversionTables = (spec: any): string[] => {
    const lines = (spec?.observations?.series ?? []).flatMap((series: any) => {
        const conversion = series?.conversion;

        if (!conversion) return [];

        const tables = conversion.table_provenance?.label ?? conversion.table_provenance?.ref;
        const from = tables ? ` from ${tables}` : '';

        return [
            `Exchange rates${from}, version ${conversion.exchange_rate_table_version}`,
            ...(conversion.deflator_table_version
                ? [`Deflators${from}, version ${conversion.deflator_table_version}`]
                : []),
        ];
    });

    return [...new Set<string>(lines)];
};

const unitAbout = (token: SentenceToken, spec: any): TokenAboutModel => {
    const basis = priceBasis(spec);
    const unit = spec?.facets?.unit;
    const code: string | null = unit?.currency ?? null;
    const name = code ? currencyName(code, spec?.unit_conversion ?? null) : null;

    return {
        kind: 'unit',
        title: sentenceCase(token.text.trim()),
        facts: code ? [name === code ? code : `${sentenceCase(name ?? code)} (${code})`] : [],
        notes: [...(basis ? [priceBasisWords(basis)] : []), ...conversionTables(spec)],
        definitions: typeof unit?.ref === 'string' ? [{ label: null, dcid: unit.ref }] : [],
        sources: [],
    };
};

/** The provenances the source token names: the source slot's bound values,
 *  else the sources the engine resolved. */
const sourceRefs = (spec: any): any[] => {
    const binding = (spec?.slots ?? []).find((slot: any) => slot?.key?.axis === 'source')?.binding;
    const bound =
        binding?.kind === 'value'
            ? [binding.value?.ref]
            : binding?.kind === 'set'
              ? (binding.values ?? []).map((value: any) => value?.ref)
              : [];
    const resolved: any[] = spec?.resolution?.resolved_sources ?? [];
    const refs = bound.filter((ref: any) => ref?.dcid);

    // A bound ref carries no publisher, so take the resolved one's when it
    // names the same provenance.
    return refs.length > 0
        ? refs.map((ref: any) => resolved.find((r) => r?.dcid === ref.dcid) ?? ref)
        : resolved;
};

const sourceAbout = (token: SentenceToken, spec: any): TokenAboutModel => {
    const sources: AboutSource[] = sourceRefs(spec).map((ref) => ({
        dcid: ref.dcid,
        label: ref.label ?? ref.dcid,
        origin: provenanceOrigin(ref),
    }));

    return {
        kind: 'source',
        title: token.text.trim(),
        facts: [],
        notes: [],
        definitions: [],
        sources,
    };
};

/** The About block for `token`'s current value on `spec`. `statedElsewhere`
 *  holds the refs the sentence's other visible tokens state
 *  (`refsStatedBesides`), which a measure's About leaves to them. A slot
 *  token without an axis or role (a phrase the engine binds to an option
 *  list) reads as a code. */
export const tokenAbout = (
    token: SentenceToken,
    spec: any,
    statedElsewhere: ReadonlySet<string> = new Set(),
): TokenAboutModel => {
    if (token.axis === 'what') return measureAbout(token, spec, statedElsewhere);
    if (token.axis === 'unit') return unitAbout(token, spec);
    if (token.axis === 'source') return sourceAbout(token, spec);
    if (token.axis === 'when') return periodAbout(token, spec);
    if (token.role || token.axis === 'where') return entityAbout(token, spec);

    return codeAbout(token, spec);
};
