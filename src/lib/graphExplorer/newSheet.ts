/**
 * The Start a sheet page's state: read from and written to the URL query so a
 * sheet can be shared and reloaded, then resolved against the model into the
 * choices the page offers and the sheet they make.
 *
 * - `?class=<class dcid>`: the kind of thing the figures are about
 * - `?measured=<property dcid>`: the measured property
 * - `?split=<dcid>,<dcid>`: the ticked properties, in column order
 * - `?split=`: no property ticked
 * - `?dataset=<provenance dcid>&pattern=<index>`: a dataset pattern to start from
 * - `show` and `base`, carried through unread (explore.ts)
 *
 * A parameter left out takes its default: the class from the pattern, else the
 * kind of thing the most datasets use. The measured property and the ticked
 * properties come from the pattern, else from the class's most-used pattern. A
 * `class`, `measured` or `split` id, or a `dataset` and `pattern` pair, the
 * model does not offer takes the same default, and the selection names it
 * (SheetSelection.unknown). A pattern about no kind of thing counts as one the
 * model does not offer.
 */
import {
    queryString,
    queryValue,
    writeCarried,
    type Carried,
    type QueryReader,
} from './explore.ts';
import type { Model } from './model.ts';
import { NEW_SHEET_PATH } from './paths.ts';
import type { SheetSpec } from './sheet.ts';
import type { SchemaPattern } from './wire.ts';

/** A pattern named by its dataset and its index in that dataset's patterns. */
export type PatternRef = { readonly dataset: string; readonly index: number };

/** The page state as the URL holds it, before the model fills the defaults. */
export type SheetQuery = {
    readonly classId: string | null;
    readonly measured: string | null;
    /** The ticked properties in order. Null takes the default. */
    readonly split: readonly string[] | null;
    readonly from: PatternRef | null;
};

type SheetQueryReader = QueryReader & { has(name: string): boolean };

const readFrom = (params: SheetQueryReader): PatternRef | null => {
    const dataset = queryValue(params, 'dataset');
    const pattern = queryValue(params, 'pattern');
    if (dataset === null || pattern === null || !/^\d+$/.test(pattern)) return null;
    return { dataset, index: Number(pattern) };
};

/** The page state a query string holds. */
export const readSheetQuery = (params: SheetQueryReader): SheetQuery => ({
    classId: queryValue(params, 'class'),
    measured: queryValue(params, 'measured'),
    split: params.has('split')
        ? [...new Set((params.get('split') ?? '').split(',').filter((id) => id !== ''))]
        : null,
    from: readFrom(params),
});

/** The page state with nothing chosen, so every choice takes its default. */
export const NO_SHEET_QUERY: SheetQuery = Object.freeze({
    classId: null,
    measured: null,
    split: null,
    from: null,
});

/**
 * The query string for a page state and the carried parameters, `?`
 * included, or '' when nothing is set.
 */
export const sheetQuery = (query: SheetQuery, carried: Carried): string => {
    const params = new URLSearchParams();
    if (query.classId !== null) params.set('class', query.classId);
    if (query.measured !== null) params.set('measured', query.measured);
    if (query.split !== null) params.set('split', query.split.join(','));
    if (query.from !== null) {
        params.set('dataset', query.from.dataset);
        params.set('pattern', String(query.from.index));
    }
    writeCarried(params, carried);
    return queryString(params);
};

/** The Start a sheet address for a page state and the carried parameters. */
export const sheetHref = (query: Partial<SheetQuery>, carried: Carried): string =>
    `${NEW_SHEET_PATH}${sheetQuery({ ...NO_SHEET_QUERY, ...query }, carried)}`;

/** A pattern with where it sits. */
export type PlacedPattern = PatternRef & { readonly pattern: SchemaPattern };

/** A property the page offers to split the figures by. */
export type SplitOption = {
    readonly id: string;
    /** The value list the property draws from, or null. */
    readonly valueList: string | null;
    /** How many members the value list lists. 0 without a value list. */
    readonly members: number;
    /** False when the graph holds members of the value list that `members` leaves out. */
    readonly membersComplete: boolean;
    /** The datasets whose StatVars use the property, most StatVars first. */
    readonly datasets: readonly string[];
    /** Whether a pattern about the class splits by it. */
    readonly inUse: boolean;
};

/**
 * An id from the URL the model does not offer, with the parameter that named
 * it. For a dataset pattern, it holds the dataset's id and the pattern's index.
 */
export type UnknownChoice =
    | { readonly param: 'class' | 'measured' | 'split'; readonly id: string }
    | { readonly param: 'pattern'; readonly id: string; readonly index: number };

export type SheetSelection = {
    readonly classId: string;
    readonly measured: string;
    /** The ticked properties, in column order. */
    readonly properties: readonly string[];
    /** The pattern the definition fields come from, or null when none fits. */
    readonly template: PlacedPattern | null;
    /** Whether the template is the pattern the URL names. */
    readonly templateNamed: boolean;
    /** The measured properties patterns about the class use, most used first. */
    readonly measuredOptions: readonly string[];
    /** The properties to tick, those in use first, each part most used first. */
    readonly splitOptions: readonly SplitOption[];
    readonly spec: SheetSpec;
    /**
     * The URL's choices the model does not offer, which their defaults
     * replace: the pattern, then the class, the measured property and the ticks.
     */
    readonly unknown: readonly UnknownChoice[];
};

const place = (ref: PatternRef, pattern: SchemaPattern): PlacedPattern =>
    Object.freeze({ ...ref, pattern });

/** The pattern a reference names, or null. */
const named = (model: Model, ref: PatternRef | null): PlacedPattern | null => {
    if (ref === null) return null;
    const pattern = model.dataset(ref.dataset)?.patterns[ref.index];
    return pattern ? place(ref, pattern) : null;
};

/**
 * The class and every class narrower than it. A pattern about any of them
 * counts as about the class, the rule Model.propertiesOf counts roles by, so
 * the options the page offers and the patterns it picks agree.
 */
export const classAndNarrower = (model: Model, classId: string): ReadonlySet<string> => {
    const found = new Set([classId]);
    for (const id of found) {
        for (const child of model.narrower(id)) found.add(child);
    }
    return found;
};

/**
 * The pattern about the class or a narrower class (classAndNarrower) with the
 * most StatVars, optionally with one measured property. The earlier dataset
 * and pattern win a tie.
 */
export const mostUsedPattern = (
    model: Model,
    classId: string,
    measured?: string,
): PlacedPattern | null => {
    const about = classAndNarrower(model, classId);
    let best: PlacedPattern | null = null;
    for (const dataset of model.datasets) {
        for (const [index, pattern] of dataset.patterns.entries()) {
            if (pattern.population_type === null || !about.has(pattern.population_type)) continue;
            if (measured !== undefined && pattern.measured_property !== measured) continue;
            if (best === null || pattern.stat_var_count > best.pattern.stat_var_count) {
                best = place({ dataset: dataset.ref, index }, pattern);
            }
        }
    }
    return best;
};

/**
 * The properties a class's figures can be split by: those a pattern about the
 * class splits by, then those declared for the class that no pattern uses
 * and that draw from a value list.
 */
export const splitOptions = (model: Model, classId: string): readonly SplitOption[] => {
    const option = (id: string, inUse: boolean): SplitOption => {
        const valueList = model.valueListOfProperty(id) ?? null;
        return Object.freeze({
            id,
            valueList,
            members: valueList === null ? 0 : model.members(valueList).length,
            membersComplete: valueList === null || model.membersComplete(valueList),
            datasets: Object.freeze(model.usage(id).byDataset.map((entry) => entry.dataset)),
            inUse,
        });
    };
    const { all, groups } = model.propertiesOf(classId);
    const used = all.filter((property) => property.roles.includes('split'));
    const unused = groups.unused.filter(
        (property) => property.declared && model.valueListOfProperty(property.id) !== undefined,
    );
    return Object.freeze([
        ...used.map((property) => option(property.id, true)),
        ...unused.map((property) => option(property.id, false)),
    ]);
};

/**
 * The page's choices and the sheet they make, or null when no dataset
 * pattern names a kind of thing.
 */
export const resolveSheet = (model: Model, query: SheetQuery): SheetSelection | null => {
    const classes = model.populationTypes().map((use) => use.classId);
    const fromUrl = named(model, query.from);
    const classId =
        [query.classId, fromUrl?.pattern.population_type].find(
            (id): id is string => id != null && classes.includes(id),
        ) ?? classes[0];
    if (classId === undefined) return null;

    const start = fromUrl?.pattern.population_type === classId ? fromUrl : null;
    const measuredOptions = model
        .propertiesOf(classId)
        .all.filter((property) => property.roles.includes('measured'))
        .map((property) => property.id);
    const fallback = start ?? mostUsedPattern(model, classId);
    const measured =
        [query.measured, fallback?.pattern.measured_property].find(
            (id): id is string => id != null && measuredOptions.includes(id),
        ) ??
        measuredOptions[0] ??
        '';

    const templateNamed = start !== null && start.pattern.measured_property === measured;
    const template = templateNamed ? start : mostUsedPattern(model, classId, measured);

    const options = splitOptions(model, classId);
    const offered = new Set(options.map((option) => option.id));
    const wanted = query.split ?? template?.pattern.constraint_properties ?? [];
    const properties = Object.freeze([...new Set(wanted)].filter((id) => offered.has(id)));

    const unknown: UnknownChoice[] = [];
    // A pattern about no kind of thing cannot start a sheet, so it counts as unknown too.
    if (query.from !== null && (fromUrl === null || fromUrl.pattern.population_type === null)) {
        unknown.push({ param: 'pattern', id: query.from.dataset, index: query.from.index });
    }
    if (query.classId !== null && query.classId !== classId) {
        unknown.push({ param: 'class', id: query.classId });
    }
    if (query.measured !== null && query.measured !== measured) {
        unknown.push({ param: 'measured', id: query.measured });
    }
    for (const id of query.split ?? []) {
        if (!offered.has(id)) unknown.push({ param: 'split', id });
    }

    return Object.freeze({
        classId,
        measured,
        properties,
        template,
        templateNamed,
        measuredOptions: Object.freeze(measuredOptions),
        splitOptions: options,
        spec: Object.freeze({
            classId,
            measuredProperty: measured,
            statType: template?.pattern.stat_type ?? null,
            qualifier: template?.pattern.measurement_qualifier ?? null,
            denominator: template?.pattern.measurement_denominator ?? null,
            observationProperties: Object.freeze([
                ...(template?.pattern.observation_properties ?? []),
            ]),
            properties,
        }),
        unknown: Object.freeze(unknown.map((choice) => Object.freeze(choice))),
    });
};

/** The URL state that holds a selection exactly, with every choice written out. */
export const queryOf = (selection: SheetSelection): SheetQuery => ({
    classId: selection.classId,
    measured: selection.measured,
    split: selection.properties,
    from:
        selection.templateNamed && selection.template
            ? { dataset: selection.template.dataset, index: selection.template.index }
            : null,
});
