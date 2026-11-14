/**
 * What the focus picture draws around one term or dataset: a box per kind of
 * connection, each on one side of the centre with the words on its join.
 *
 * - above: broader terms (for a value, also its value list)
 * - left: what the term is used with or applies to
 * - right: what the term connects to
 * - below: narrower terms
 *
 * Each box lists every entry, most used first; a screen shows the first
 * BOX_LIMIT and opens the rest where `more` says.
 */
import {
    KIND_WORDS,
    kindOfTerm,
    type DatasetFilter,
    type DatasetView,
    type Kind,
    type Model,
    type ValuesUsed,
} from './model.ts';
import type { OntologyTerm, OntologyTerms } from './wire.ts';

export type Side = 'up' | 'left' | 'right' | 'down';

export type FocusBox = {
    /** Unique among one picture's boxes. */
    readonly key: string;
    readonly side: Side;
    readonly title: string;
    /** The words on the line between the box and the centre. */
    readonly join: string;
    readonly ids: readonly string[];
    /** Where "All N" opens the full list: the class's scoped list, or the panel. */
    readonly more: 'list' | 'panel';
    /** For a dataset's splits, the members of each property's value list it uses. */
    readonly values: ReadonlyMap<string, ValuesUsed> | null;
};

/** The most entries a box shows before its "All N" control. */
export const BOX_LIMIT = 8;

/** The kinds a narrower or broader entry of each kind keeps. */
const SAME_KIND: Record<Kind, readonly Kind[]> = {
    class: ['class', 'valueList'],
    valueList: ['valueList'],
    property: ['property'],
    value: ['value'],
};

const box = (
    key: string,
    side: Side,
    title: string,
    join: string,
    ids: readonly string[],
    more: FocusBox['more'] = 'panel',
    values: FocusBox['values'] = null,
): FocusBox =>
    Object.freeze({ key, side, title, join, ids: Object.freeze([...ids]), more, values });

/** The boxes around a term the model holds, empty boxes left out; [] for any other id. */
export function nodeBoxes(model: Model, id: string): readonly FocusBox[] {
    const kind = model.kind(id);
    if (kind === undefined) return [];

    const ofKind = (ids: readonly string[]): readonly string[] =>
        ids.filter((other) => {
            const otherKind = model.kind(other);
            return otherKind === undefined || SAME_KIND[kind].includes(otherKind);
        });
    const narrower = model.byUse(
        model.narrower(id).filter((other) => {
            const otherKind = model.kind(other);
            return otherKind !== undefined && SAME_KIND[kind].includes(otherKind);
        }),
    );

    const boxes: FocusBox[] = [];
    switch (kind) {
        case 'class': {
            const { groups } = model.propertiesOf(id);
            const ids = (group: keyof typeof groups) => groups[group].map((entry) => entry.id);
            boxes.push(
                box('up', 'up', 'A kind of', 'includes', model.byUse(ofKind(model.broader(id)))),
                box(
                    'left',
                    'left',
                    'It can be the value of',
                    'takes a value from',
                    model.byUse(model.propertiesWithRange(id)),
                ),
                box(
                    'measured',
                    'right',
                    'What is measured',
                    'measured as',
                    ids('measured'),
                    'list',
                ),
                box('between', 'right', 'Between whom', 'between', ids('between'), 'list'),
                box('split', 'right', 'Split by', 'split by', ids('split'), 'list'),
                box('down', 'down', 'Kinds of it', 'includes', narrower),
            );
            break;
        }
        case 'property':
            boxes.push(
                box('up', 'up', 'Narrows', 'narrows', model.byUse(model.broader(id))),
                box(
                    'left',
                    'left',
                    'Used with',
                    'has',
                    model.usedWith(id).map((use) => use.classId),
                ),
                box(
                    'right',
                    'right',
                    'Takes its value from',
                    'takes a value from',
                    model.byUse(model.node(id)?.range_includes ?? []),
                ),
                box('down', 'down', 'Narrowed by', 'is narrowed by', narrower),
            );
            break;
        case 'valueList':
            boxes.push(
                box('up', 'up', 'Part of', 'includes', model.byUse(ofKind(model.broader(id)))),
                box(
                    'left',
                    'left',
                    'Set with',
                    'takes a value from',
                    model.byUse(model.propertiesWithRange(id)),
                ),
                box('down', 'down', 'Narrower lists', 'includes', narrower),
            );
            break;
        case 'value': {
            const list = model.valueListOf(id);
            boxes.push(
                box('list', 'up', 'Value list', 'holds', list === undefined ? [] : [list]),
                box(
                    'up',
                    'up',
                    'Broader value',
                    'includes',
                    model.byUse(ofKind(model.broader(id))),
                ),
                box(
                    'left',
                    'left',
                    'Set with',
                    'takes this value',
                    list === undefined ? [] : model.byUse(model.propertiesWithRange(list)),
                ),
                box('down', 'down', 'Narrower values', 'includes', narrower),
            );
            break;
        }
    }
    return Object.freeze(boxes.filter((entry) => entry.ids.length > 0));
}

/**
 * How many properties a class declares that no dataset's pattern about it
 * uses; 0 for any other id.
 */
export function definedNotUsed(model: Model, id: string): number {
    return model.kind(id) === 'class' ? model.propertiesOf(id).groups.unused.length : 0;
}

/** The boxes around a dataset, each in the dataset's own order of use, empty boxes left out. */
export function datasetBoxes(view: DatasetView): readonly FocusBox[] {
    const values = new Map<string, ValuesUsed>();
    for (const split of view.splits) {
        if (split.values !== null) values.set(split.property, split.values);
    }
    const boxes = [
        box('about', 'left', 'What it is about', 'about', view.populationTypes),
        box('measured', 'right', 'What it measures', 'measures', view.measured),
        box('between', 'right', 'Between whom', 'between', view.between),
        box(
            'split',
            'right',
            'Split by',
            'split by',
            view.splits.map((split) => split.property),
            'panel',
            values,
        ),
    ];
    return Object.freeze(boxes.filter((entry) => entry.ids.length > 0));
}

/**
 * A property's declared domain when it differs from the classes the picture
 * shows it used with; null when the two hold the same classes or the
 * property declares none.
 */
export function declaredDomain(model: Model, id: string): readonly string[] | null {
    const domain = model.node(id)?.domain_includes ?? [];
    if (domain.length === 0) return null;
    const used = new Set(model.usedWith(id).map((use) => use.classId));
    const same = domain.length === used.size && domain.every((classId) => used.has(classId));
    return same ? null : domain;
}

/** What is centred: a term (`?node=`) or a dataset (`?dataset=`). */
export type Centre = { readonly kind: 'node' | 'dataset'; readonly id: string };

/** The line under the centre's name. */
export type CentreSub =
    | { readonly kind: 'statVars'; readonly count: number }
    | { readonly kind: 'codes'; readonly codes: readonly string[] }
    | { readonly kind: 'dcid'; readonly id: string };

/** The centre of the picture as its heading shows it. */
export type CentreHeading = {
    /** The words over the name: what the centre is. */
    readonly kind: string;
    readonly name: string;
    readonly sub: CentreSub | null;
    /** Whether the base tag follows the name. */
    readonly base: boolean;
    /** The term on the graph outside the model, when the terms list holds it. */
    readonly term: OntologyTerm | undefined;
};

/**
 * The heading for a centred dataset, model term, or term outside the model
 * (found in `baseTerms` when given); null for a dataset the model lacks.
 */
export function centreHeading(
    model: Model,
    centre: Centre,
    baseTerms?: OntologyTerms,
): CentreHeading | null {
    if (centre.kind === 'dataset') {
        const view = model.datasetView(centre.id);
        if (!view) return null;
        return {
            kind: KIND_WORDS.dataset,
            name: view.label,
            sub: { kind: 'statVars', count: view.statVarCount },
            base: false,
            term: undefined,
        };
    }
    const kind = model.kind(centre.id);
    if (kind !== undefined) {
        const codes = model.node(centre.id)?.classification_code ?? [];
        return {
            kind: KIND_WORDS[kind],
            name: model.label(centre.id),
            sub: codes.length > 0 ? { kind: 'codes', codes } : null,
            base: model.isBase(centre.id),
            term: undefined,
        };
    }
    const term = baseTerms?.terms.find((entry) => entry.dcid === centre.id);
    return {
        kind: term ? 'Base Data Commons' : 'Not in the DFO model',
        name: term?.name ?? centre.id,
        sub: { kind: 'dcid', id: centre.id },
        base: term?.declared_by === 'base',
        term,
    };
}

/** What a term outside the model is, for its panel's label. */
export const outsideKind = (term: OntologyTerm | undefined): string =>
    term ? `${KIND_WORDS[kindOfTerm(term)]} on the graph` : 'Not in the DFO model';

/**
 * The dataset whose use the picture marks: the filtered dataset, except on
 * that dataset's own view, where every entry would carry the same mark.
 */
export const pictureLens = (centre: Centre, show: DatasetFilter): string | null => {
    if (show.kind !== 'dataset') return null;
    return centre.kind === 'dataset' && centre.id === show.id ? null : show.id;
};

/**
 * `part` as a whole percentage of `whole`: 0 when either is 0, else at
 * least 1, so a small share never reads as none.
 */
export const sharePercent = (part: number, whole: number): number =>
    part <= 0 || whole <= 0 ? 0 : Math.max(1, Math.round((100 * part) / whole));

/** The reader's words for the ISO 8601 durations a dataset's series are observed over. */
const PERIOD_WORDS: Readonly<Record<string, string>> = {
    P1Y: 'Yearly',
    P3M: 'Quarterly',
    P1M: 'Monthly',
    P1D: 'Daily',
};

/** An observation period in words with its code, "Yearly (P1Y)"; any other code as it is. */
export const periodText = (code: string): string => {
    const words = PERIOD_WORDS[code];
    return words === undefined ? code : `${words} (${code})`;
};
