/**
 * The More Info panel's view of a card. A described card's view answers
 * four questions in order: what the card shows and what its measure means,
 * what to keep in mind, where the data comes from, and how to cite it. A
 * quotient or share card opens with what it divides by what. The card's own
 * steps sit last, collapsed, as a rail of verbs and objects. A legacy card's
 * view (`infoPanel.ts`) is labelled blocks of rows and sentences. Both are
 * plain data, so the logic stays here, where `node --test` reaches it.
 *
 * A described view shows each fact once and no row whose value is 0, None or
 * Unknown. Identifiers stay in the download bundle.
 */

import type {
    DefinedRef,
    Description,
    DescriptionUnit,
    ServedStep,
    SimpleUnit,
    Span,
    UnitSide,
} from './description.ts';
import { capitalise } from '../capitalise.ts';
import { shortDateText } from '../sources/updateDates.ts';
import { formatPeriod, formatWindow } from './period.ts';

export type PanelRow = { label: string; value: string };

/** One source. `url` is an outside page; `page` is the source's dcid, whose
 *  page on this site (/data/sources/<dcid>) the name links to. `lookup`
 *  names a source whose name and outside page the panel reads from the
 *  graph's documentation on open; a described source has none, since its
 *  description already holds both. */
export type PanelSource = {
    key: string;
    name: string;
    url: string | null;
    page: string | null;
    meta: string | null;
    lookup: string | null;
};

/** A labelled block: rows of a label and a value, then sentences. */
export type PanelBlock = { key: string; label: string | null; rows: PanelRow[]; items: string[] };

/** An indicator of a legacy card, with its id and description where a
 *  reader can use them. */
export type PanelIndicator = {
    key: string;
    name: string;
    id: string | null;
    description: string | null;
};

/** The view of a card that carries no description. */
export type LegacyView = {
    kind: 'legacy';
    citation: string | null;
    sources: PanelSource[];
    blocks: PanelBlock[];
    indicators: PanelIndicator[];
};

/** A value the card shows or is fixed to, by name, with its definition
 *  where the graph holds one. */
export type PanelTerm = { key: string; name: string; definition: string | null };

/** Values by name under one label, either those the card draws on a
 *  dimension ("Shows", or the dimension's name when several list theirs) or
 *  "Within", the defined values its version is fixed to. */
export type PanelTerms = { key: string; label: string; terms: PanelTerm[] };

/** The offer to add a snapshot link to the citation, made to the card's
 *  owner while the citation names none. `note` is a sentence before it, for a
 *  live card, whose link can show new numbers later. */
export type PanelLinkOffer = { note: string | null };

/** The citation in two forms: `short`, the description's own line, and
 *  `full`, the reference-list form, each naming the snapshot link when the
 *  card is cited from one. `offer` is null for anyone but the
 *  card's owner, and once the citation names a snapshot. */
export type PanelCite = { short: string; full: string; offer: PanelLinkOffer | null };

/** A page on this site that says how a source's data is processed. */
export type PanelSourcePage = { key: string; name: string; page: string };

/** One step on the card's rail: a verb and its object ("Get" · "Gross
 *  national income"), and the composer's sentence for it as the detail one
 *  click away, null when the row says it all. A step whose operation the
 *  panel cannot name has no verb, and its sentence is the object.
 *  `givesCard` marks the last step, which draws the card. */
export type PanelStep = {
    key: string;
    verb: string | null;
    object: string;
    detail: string | null;
    givesCard: boolean;
};

/** How the card was made: its own steps, a sentence when they are unknown,
 *  and the pages of its documented sources. */
export type PanelMade = { steps: PanelStep[]; notes: string[]; pages: PanelSourcePage[] };

/** What a computed card divides by what, by its inputs' labels. */
export type PanelCalculation = { numerator: string; denominator: string };

/** A described card's view. `live` is a short line under the title saying
 *  the card is drawn live from current data. `calculation` is a quotient or
 *  share card's numerator over its denominator, shown first. `measure` is
 *  present only when the measure has a definition. `sources` are the sources
 *  the card credits. `inputs` names the versions a computed card read when
 *  no calculation names them, and is empty otherwise. `from` closes a
 *  computed card's sources. `made` is null when there is nothing to tell. */
export type DescribedView = {
    kind: 'described';
    title: string;
    live: string | null;
    calculation: PanelCalculation | null;
    measure: { label: string; definition: string } | null;
    rows: PanelRow[];
    terms: PanelTerms[];
    keepInMind: string[];
    from: string | null;
    sources: PanelSource[];
    inputs: string[];
    cite: PanelCite;
    made: PanelMade | null;
};

export type PanelView = LegacyView | DescribedView;

/** Reads a description's `null` members against its gaps. A `null` with its
 *  path in `gaps` is unknown, and a `null` without is none. */
export type Gaps = { unknown: (path: string) => boolean };

export const gapsOf = (description: Description): Gaps => {
    const gaps = new Set(description.gaps);

    return { unknown: (path) => gaps.has(path) };
};

const spanLabel = (span: Span): string => (span.grain === 'year' ? 'Years' : 'Period');

/** A property's name as a plural label: "sector" reads "Sectors", "flow
 *  type" "Flow types", "country" "Countries". */
export const pluralLabel = (name: string): string => {
    const plural = /[^aeiou]y$/.test(name)
        ? `${name.slice(0, -1)}ies`
        : /(s|x|z|ch|sh)$/.test(name)
          ? `${name}es`
          : `${name}s`;

    return capitalise(plural);
};

// One unit on both sides of a quotient, meaning the same variable or the
// same dcid, currency and price basis.
const sameSide = (left: UnitSide, right: UnitSide): boolean => {
    if ('stat_var' in left || 'stat_var' in right) {
        return 'stat_var' in left && 'stat_var' in right && left.stat_var === right.stat_var;
    }

    const identity = (unit: SimpleUnit): string =>
        JSON.stringify([unit.ref, unit.currency, unit.prices, unit.base_year]);

    return identity(left) === identity(right);
};

const sideWords = (side: UnitSide): string => ('stat_var' in side ? side.label : unitWords(side));

/** A unit in words: its label with its price basis ("US dollars, constant
 *  2021 prices"), a composed unit's sides ("US dollars per population"), or
 *  "Ratio" for a unit divided by itself. */
export const unitWords = (unit: DescriptionUnit): string => {
    if ('numerator' in unit) {
        return sameSide(unit.numerator, unit.denominator)
            ? 'Ratio'
            : `${sideWords(unit.numerator)} per ${sideWords(unit.denominator)}`;
    }

    if (unit.prices === 'constant' && unit.base_year !== undefined) {
        return `${unit.label}, constant ${unit.base_year} prices`;
    }

    return unit.prices ? `${unit.label}, ${unit.prices} prices` : unit.label;
};

/** The licence of the description's source at `index` in words: as
 *  recorded, "licence unknown" for a `null` its gaps name, "no licence" for
 *  one they do not, and null when the source does not say. */
export const licenceWords = (
    description: Description,
    index: number,
    gaps: Gaps,
): string | null => {
    const licence = description.sources[index]?.licence;

    if (licence === undefined) {
        return null;
    }

    if (licence === null) {
        return gaps.unknown(`sources.${index}.licence`) ? 'licence unknown' : 'no licence';
    }

    return licence;
};

const DOCUMENTATION_ROUTE = '/api/graph/documentation/';

/** The dcid a source's `documentation` route names, whose page on this site
 *  is /data/sources/<dcid>: the route's path after the documentation door,
 *  each segment decoded. Null for a route outside that door or one that
 *  does not decode. */
export const documentedSource = (documentation: string | undefined): string | null => {
    if (!documentation?.startsWith(DOCUMENTATION_ROUTE)) {
        return null;
    }

    try {
        const dcid = documentation
            .slice(DOCUMENTATION_ROUTE.length)
            .split('/')
            .map(decodeURIComponent)
            .join('/');

        return dcid || null;
    } catch {
        // A malformed escape.
        return null;
    }
};

/** A source's name with its publisher first ("OECD Creditor Reporting
 *  System"), unless the name already holds the publisher's. */
export const publisherFirst = (label: string, publisher: string | null | undefined): string =>
    publisher && !label.toLowerCase().includes(publisher.toLowerCase())
        ? `${publisher} ${label}`
        : label;

/** Whether a source entry is a computed version's input, which names the
 *  content version it read, where a credited source names none. */
export const isInputSource = (source: { content_version?: unknown }): boolean =>
    source.content_version !== undefined;

/** Where it comes from: each source the card credits by its publisher and
 *  name, linked to the page of the source its document describes, then its
 *  licence as recorded. A computed version's inputs are no credit and stay
 *  out (`inputsOf`). */
export const sourceEntries = (description: Description): PanelSource[] =>
    description.sources.flatMap((source, index) =>
        isInputSource(source)
            ? []
            : [
                  {
                      key: `${source.ref ?? source.label}#${index}`,
                      name: publisherFirst(source.label, source.publisher),
                      url: null,
                      page: documentedSource(source.documentation),
                      meta: typeof source.licence === 'string' ? source.licence : null,
                      lookup: null,
                  },
              ],
    );

/** What a computed card's calculation used: each input version by name, once. */
export const inputsOf = (description: Description): string[] => [
    ...new Set(description.sources.filter(isInputSource).map((source) => source.label)),
];

/** How many values the card draws on each dimension that does not list
 *  them (a card stored without them, or one drawing more than 50),
 *  then the years and the unit, each only when known. A card's years are the
 *  ones it draws. */
export const aboutRows = (description: Description): PanelRow[] => {
    const { about } = description;
    const period = about.drawn?.period ?? about.period;

    return [
        ...(about.drawn?.dimensions ?? []).flatMap(({ property, count, values }) =>
            values || count === 0
                ? []
                : [{ label: pluralLabel(property.label), value: String(count) }],
        ),
        ...(period ? [{ label: spanLabel(period), value: formatWindow(period) }] : []),
        ...(about.unit ? [{ label: 'Unit', value: unitWords(about.unit) }] : []),
    ];
};

const termOf = (value: DefinedRef, index: number): PanelTerm => ({
    key: `${value.ref}#${index}`,
    name: value.label,
    definition: value.definition ?? null,
});

/** What the card shows, by name. These are the values it draws on each
 *  dimension that lists them all, under "Shows" when one dimension does and
 *  under each dimension's name when several do. Then what it is within, the
 *  values its version is fixed to that carry a definition. */
export const termLists = (description: Description): PanelTerms[] => {
    const { about } = description;
    const listed = (about.drawn?.dimensions ?? []).filter(
        (dimension) => dimension.values && dimension.values.length > 0,
    );
    const drawn = listed.map(({ property, values = [] }): PanelTerms => ({
        key: `drawn:${property.ref}`,
        label: listed.length > 1 ? pluralLabel(property.label) : 'Shows',
        terms: values.map(termOf),
    }));
    const defined = (about.fixed ?? [])
        .map(({ value }) => value)
        .filter((value) => value.definition !== undefined);

    return [
        ...drawn,
        ...(defined.length ? [{ key: 'within', label: 'Within', terms: defined.map(termOf) }] : []),
    ];
};

const UNIT_UNKNOWN = 'The unit is not known.';

// How many values are estimates or provisional, unless a caveat of that kind
// already says so.
const countLine = (
    description: Description,
    kind: 'estimated' | 'provisional',
    count: number | null | undefined,
): string[] => {
    if (!count || description.caveats.some((caveat) => caveat.kind === kind)) {
        return [];
    }

    const noun = kind === 'estimated' ? 'an estimate' : 'provisional';
    const nouns = kind === 'estimated' ? 'estimates' : 'provisional';

    return [count === 1 ? `1 value is ${noun}.` : `${count} values are ${nouns}.`];
};

// How many of the card's series reach the latest period, when some do not.
// The total is the series it draws, or for a version the series it holds.
const reachLine = (description: Description): string[] => {
    const { about, freshness } = description;
    const total = about.drawn?.series ?? about.series;
    const reaching = freshness.series_reaching_it;
    const latest = freshness.latest_period;

    if (typeof total !== 'number' || typeof reaching !== 'number' || !latest || reaching >= total) {
        return [];
    }

    return [
        `${reaching} of ${total} series ${reaching === 1 ? 'reaches' : 'reach'} ${formatPeriod(latest)}.`,
    ];
};

/** What to keep in mind: each caveat's sentence, then how many values are
 *  estimates and how many provisional when the description counts some and
 *  no caveat of that kind says so, how many series reach the latest period
 *  when some do not, and a sentence when the unit is unknown. */
export const keepInMind = (description: Description): string[] => {
    const unitUnknown =
        description.about.unit === null && gapsOf(description).unknown('about.unit');

    return [
        ...description.caveats.map((caveat) => caveat.text),
        ...countLine(description, 'estimated', description.freshness.estimated_values),
        ...countLine(description, 'provisional', description.freshness.provisional_values),
        ...reachLine(description),
        ...(unitUnknown ? [UNIT_UNKNOWN] : []),
    ];
};

const DATE = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
});

const calendarDate = (date: string): Date | null => {
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;

    return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
};

/** A calendar date (`2026-09-28`) as a reference list writes it: "28
 *  September 2026". Other text stays as it is. */
export const dateWords = (date: string): string => {
    const parsed = calendarDate(date);

    return parsed ? DATE.format(parsed) : date;
};

/** The calendar date (`2026-10-12`) a moment falls on in the reader's own
 *  time zone, as the snapshot banner reads it. */
export const localDay = (moment: Date): string =>
    [
        String(moment.getFullYear()).padStart(4, '0'),
        String(moment.getMonth() + 1).padStart(2, '0'),
        String(moment.getDate()).padStart(2, '0'),
    ].join('-');

const LIVE_NOTE = 'A live link can show new numbers later.';

/** The citation's short form, the description's line, and its
 *  reference-list form: `{text}. "{title}" [dataset]. Retrieved {date}.`,
 *  where the date is the day the reader reads the card (`retrievedOn`).
 *  Cited from a snapshot share (`snapshotUrl`), the short form ends `.
 *  {url}` and the full form ` from {url} (snapshot, data as of {date}).`,
 *  the date the snapshot captured its data (`snapshotAsOf`), or
 *  `(snapshot)` alone when that date is unknown. Only the card's owner
 *  (`canShare`), who can make a snapshot, is offered one while the citation
 *  names none. */
export const citeForms = (
    description: Description,
    { retrievedOn, snapshotUrl, snapshotAsOf, canShare }: Required<PanelOptions>,
): PanelCite => {
    const { cite } = description;
    const asOf = snapshotAsOf && calendarDate(snapshotAsOf);
    const snapshot = asOf ? `snapshot, data as of ${shortDateText(asOf)}` : 'snapshot';
    const from = snapshotUrl ? ` from ${snapshotUrl} (${snapshot})` : '';

    return {
        short: snapshotUrl ? `${cite.text}. ${snapshotUrl}` : cite.text,
        full: `${cite.text}. "${cite.title}" [dataset]. Retrieved ${dateWords(retrievedOn)}${from}.`,
        offer:
            canShare && !snapshotUrl
                ? { note: description.rendering === 'live' ? LIVE_NOTE : null }
                : null,
    };
};

// A step of the source's own pipeline, which its page tells.
const SOURCE_STEP = 'source_step';

// The gaps that say a list of steps is unknown: the whole list, the
// version's own steps, or the source pipeline's.
const STEP_GAPS = ['steps', 'steps.version', 'steps.source_pipeline'];
const STEPS_UNKNOWN = 'The steps behind these figures are not known.';

const ownSteps = (description: Description): ServedStep[] =>
    (description.steps ?? []).filter((step) => step.op !== SOURCE_STEP);

// The operations that divide one step's values by another's.
const DIVIDING_OPS = new Set(['quotient', 'share']);

/** What a quotient or share card divides by what: the labels of the inputs
 *  its dividing step's numerator and denominator retrieve. Null for a card
 *  with no such step, one whose sides do not name an input, and one whose
 *  sides name the same input, a share of a total whose narrowing the labels
 *  do not carry, which would read as a thing over itself. */
export const calculationOf = (description: Description): PanelCalculation | null => {
    const steps = ownSteps(description);
    const inputLabel = (id: string): string | null =>
        steps.find((step) => step.id === id)?.input?.label ?? null;
    const sides = steps.find((step) => DIVIDING_OPS.has(step.op))?.inputs;
    const numerator = sides && inputLabel(sides.numerator);
    const denominator = sides && inputLabel(sides.denominator);

    return numerator && denominator && numerator !== denominator
        ? { numerator, denominator }
        : null;
};

// A step as a verb and its object, or null for an operation the panel
// cannot name. A retrieval says all its sentence says. The selection that
// draws the card is shown by the years it draws. A division the card's
// calculation does not name reads its sentence.
const stepRow = (
    step: ServedStep,
    description: Description,
    calculation: PanelCalculation | null,
): Pick<PanelStep, 'verb' | 'object' | 'detail'> | null => {
    const { about } = description;
    const period = about.drawn?.period ?? about.period;

    switch (step.op) {
        case 'retrieve':
            return step.input ? { verb: 'Get', object: step.input.label, detail: null } : null;
        case 'select': {
            const object = period ? formatWindow(period) : step.input?.label;

            return object ? { verb: 'Show', object, detail: step.text } : null;
        }
        case 'quotient':
            return calculation
                ? {
                      verb: 'Divide',
                      object: `${calculation.numerator} ÷ ${calculation.denominator}`,
                      detail: step.text,
                  }
                : null;
        case 'share':
            return calculation
                ? {
                      verb: 'Share',
                      object: `${calculation.numerator} of ${calculation.denominator}`,
                      detail: step.text,
                  }
                : null;
        default:
            return null;
    }
};

/** The card's own steps as rail rows, in order, the last one marked as the
 *  step that draws the card. */
export const stepRows = (description: Description): PanelStep[] => {
    const steps = ownSteps(description);
    const calculation = calculationOf(description);

    return steps.map((step, index) => ({
        key: step.id,
        ...(stepRow(step, description, calculation) ?? {
            verb: null,
            object: step.text,
            detail: null,
        }),
        givesCard: index === steps.length - 1,
    }));
};

/** How the card was made: the steps that are the card's own, a sentence
 *  when its steps are unknown, and a link to each documented source's
 *  page. */
export const madeOf = (description: Description): PanelMade | null => {
    const gaps = gapsOf(description);
    const made: PanelMade = {
        steps: stepRows(description),
        notes: STEP_GAPS.some(gaps.unknown) ? [STEPS_UNKNOWN] : [],
        pages: sourceEntries(description).flatMap(({ key, name, page }) =>
            page ? [{ key, name: `How ${name} data is processed`, page }] : [],
        ),
    };

    return made.steps.length || made.notes.length || made.pages.length ? made : null;
};

/** Whether a description is of a computed version, or of a card drawn from
 *  one, by the schema's own test on its `describes.kind` and its `cite.id`
 *  in the `ops_` family. It takes the two members as saved, so the card face
 *  asks without reading the whole description. */
export const isComputedBy = (kind: unknown, citeId: unknown): boolean =>
    kind === 'computed_version' || (typeof citeId === 'string' && citeId.startsWith('ops_'));

/** Whether the description is of a computed version, or of a card drawn
 *  from one (`isComputedBy`). */
export const isComputed = (description: Description): boolean =>
    isComputedBy(description.describes.kind, description.cite.id);

const COMPUTED_BY = 'Computed by the Development Finance Observatory.';

export type PanelOptions = {
    // The day the reader reads the card (`2026-10-12`), in their own time
    // zone, which the full citation gives as its retrieval date.
    retrievedOn: string;
    // The link of the snapshot share the card is shown on, which the full
    // citation names.
    snapshotUrl?: string | null;
    // The day that snapshot captured its data (`2026-09-28`), when known.
    snapshotAsOf?: string | null;
    // Whether the viewer owns the card and can share it, so is told how to
    // get a link to cite.
    canShare?: boolean;
};

/** The panel's view of a described card. It makes no request: every name,
 *  link and figure comes from the description. */
export const describedPanel = (
    description: Description,
    { retrievedOn, snapshotUrl = null, snapshotAsOf = null, canShare = false }: PanelOptions,
): DescribedView => {
    const { measure } = description.about;
    const calculation = calculationOf(description);

    return {
        kind: 'described',
        title: description.title,
        live: description.rendering === 'live' ? 'Drawn live from the latest data' : null,
        calculation,
        measure: measure?.definition
            ? { label: capitalise(measure.label), definition: measure.definition }
            : null,
        rows: aboutRows(description),
        terms: termLists(description),
        keepInMind: keepInMind(description),
        from: isComputed(description) ? COMPUTED_BY : null,
        sources: sourceEntries(description),
        // A calculation already names its inputs.
        inputs: calculation ? [] : inputsOf(description),
        cite: citeForms(description, { retrievedOn, snapshotUrl, snapshotAsOf, canShare }),
        made: madeOf(description),
    };
};
