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
import type { DatasetView, Kind, Model, ValuesUsed } from './model.ts';

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

    const byUse = (ids: Iterable<string>): readonly string[] =>
        model.topByUse(ids, Number.POSITIVE_INFINITY).items;
    const ofKind = (ids: readonly string[]): readonly string[] =>
        ids.filter((other) => {
            const otherKind = model.kind(other);
            return otherKind === undefined || SAME_KIND[kind].includes(otherKind);
        });
    const narrower = byUse(
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
                box('up', 'up', 'A kind of', 'includes', ofKind(model.broader(id))),
                box(
                    'left',
                    'left',
                    'It can be the value of',
                    'takes a value from',
                    byUse(model.propertiesWithRange(id)),
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
                box('up', 'up', 'Narrows', 'narrows', model.broader(id)),
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
                    model.node(id)?.range_includes ?? [],
                ),
                box('down', 'down', 'Narrowed by', 'is narrowed by', narrower),
            );
            break;
        case 'valueList':
            boxes.push(
                box('up', 'up', 'Part of', 'includes', ofKind(model.broader(id))),
                box(
                    'left',
                    'left',
                    'Set with',
                    'takes a value from',
                    byUse(model.propertiesWithRange(id)),
                ),
                box('down', 'down', 'Narrower lists', 'includes', narrower),
            );
            break;
        case 'value': {
            const list = model.valueListOf(id);
            boxes.push(
                box('list', 'up', 'Value list', 'holds', list === undefined ? [] : [list]),
                box('up', 'up', 'Broader value', 'includes', ofKind(model.broader(id))),
                box(
                    'left',
                    'left',
                    'Set with',
                    'takes this value',
                    list === undefined ? [] : byUse(model.propertiesWithRange(list)),
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
