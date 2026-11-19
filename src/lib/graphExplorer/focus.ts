/**
 * What the focus picture draws around one term or dataset: a box per kind of
 * connection, each on one side of the centre with the words on its join.
 *
 * - above: broader terms (for a value, also its value list)
 * - left: what the term is used with or applies to
 * - right: what the term connects to
 * - below: narrower terms
 *
 * Each box lists every entry, most used first. A screen shows the first
 * BOX_LIMIT and opens the rest where `more` says.
 */
import { count, plural } from './counts.ts';
import { outsideTerm, termOrigin, type TermSources } from './lists.ts';
import {
    declarerPlace,
    KIND_WORDS,
    kindOfTerm,
    kindWords,
    plainName,
    ROLES,
    type DatasetFilter,
    type DatasetView,
    type Kind,
    type Model,
    type Role,
    type ValuesUsed,
} from './model.ts';
import type { SchemaNode, SchemaPattern, UsageTerm } from './wire.ts';

export type Side = 'up' | 'left' | 'right' | 'down';

/** A schema arc a box's entries hold with the centre, named as Data Commons names it. */
export type ArcProperty =
    'subClassOf' | 'subPropertyOf' | 'specializationOf' | 'typeOf' | 'rangeIncludes';

/** A StatVar's arc to the class it is about or to a property it uses. */
export type StatVarProperty =
    'populationType' | 'measuredProperty' | 'observationProperties' | 'constraintProperties';

/**
 * How a box's entries reach the centre on the graph.
 *
 * - `arc`: each entry and the centre hold one of `properties`. With `out` the
 *   centre is the subject ("centre subClassOf entry"), with `in` the entry is.
 * - `statVars`: StatVars are the subject of two arcs, one to the centre
 *   (`centre`) and one to each entry (`entries`). `centre` is null on a
 *   dataset, whose StatVars the usage document lists by dataset.
 * - `valueList`: each entry (a property) `rangeIncludes` the list, and the
 *   centre (a value) is `typeOf` it.
 */
export type Via =
    | {
          readonly kind: 'arc';
          readonly properties: readonly ArcProperty[];
          readonly direction: 'out' | 'in';
      }
    | {
          readonly kind: 'statVars';
          readonly centre: readonly StatVarProperty[] | null;
          readonly entries: readonly StatVarProperty[];
          /** How many StatVars link the centre to the box's entries. */
          readonly statVars: number;
          /** Whether some of those StatVars are about a narrower class of the centre. */
          readonly kinds: boolean;
          /** How many entries only StatVars about a narrower class of the centre reach. */
          readonly kindsOnly: number;
      }
    | { readonly kind: 'valueList'; readonly list: string };

export type FocusBox = {
    /** Unique among one picture's boxes. */
    readonly key: string;
    readonly side: Side;
    readonly title: string;
    /** The words on the line between the box and the centre, read along its arrow. */
    readonly join: string;
    readonly via: Via;
    /** The link written out with the centre's name, for the join's bubble. */
    readonly triple: string;
    /** What an entry reached only through narrower classes means, for the bubble. Null for none. */
    readonly note: string | null;
    /** The link as one sentence, for a screen reader. */
    readonly sentence: string;
    readonly ids: readonly string[];
    /** Where "All N" opens the full list: the class's scoped list, or the panel. */
    readonly more: 'list' | 'panel';
    /** For a dataset's splits, the members of each property's value list it uses. */
    readonly values: ReadonlyMap<string, ValuesUsed> | null;
};

/**
 * How a box's join is drawn: solid for one arc, dashed through a midpoint dot
 * for a chain. A chain's heads point away from the dot (`outward`), at it
 * (`inward`), or only at the box (`box`).
 */
export type LinkShape =
    | { readonly dashed: false; readonly head: 'box' | 'centre' }
    | { readonly dashed: true; readonly heads: 'outward' | 'inward' | 'box' };

/**
 * The arrowheads of a box's join. One arc points from subject to object.
 * StatVars are the subject of both their arcs, so both heads point away from
 * the dot. A value list is the object of both, so both point at it. A
 * dataset's link to its StatVars comes from the usage document, which states
 * no arc between them, so that half has no head.
 */
export const linkShape = (via: Via): LinkShape => {
    switch (via.kind) {
        case 'arc':
            return {
                dashed: false,
                head: via.direction === 'out' ? 'box' : 'centre',
            };
        case 'statVars':
            return { dashed: true, heads: via.centre === null ? 'box' : 'outward' };
        case 'valueList':
            return { dashed: true, heads: 'inward' };
    }
};

/** One end of a half of a join in reading order: `start` is top or left, `end` is bottom or right. */
export type End = 'start' | 'end';

/**
 * Where the arrowhead sits on each half of a join, the half read first and
 * then the other. Each is an end of that half, or null for none. `boxFirst` says whether
 * the box sits before the join in reading order (above it, or left of it).
 */
export const headsOf = (shape: LinkShape, boxFirst: boolean): readonly [End | null, End | null] => {
    const atBox: readonly [End | null, End | null] = boxFirst ? ['start', null] : [null, 'end'];
    const atCentre: readonly [End | null, End | null] = boxFirst ? [null, 'end'] : ['start', null];
    if (!shape.dashed) return shape.head === 'box' ? atBox : atCentre;
    switch (shape.heads) {
        case 'outward':
            return ['start', 'end'];
        case 'inward':
            return ['end', 'start'];
        case 'box':
            return atBox;
    }
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

/** The reader's words for each arc, read from subject to object. */
const ARC_WORDS: Readonly<Record<ArcProperty, string>> = {
    subClassOf: 'is a kind of',
    subPropertyOf: 'narrows',
    specializationOf: 'is a narrower value of',
    typeOf: 'is a member of',
    rangeIncludes: 'takes values from',
};

/** The objects of each arc on a node. */
const ARC_OBJECTS: Readonly<Record<ArcProperty, (node: SchemaNode) => readonly string[]>> = {
    subClassOf: (node) => node.sub_class_of,
    subPropertyOf: (node) => node.sub_property_of,
    specializationOf: (node) => node.specialization_of,
    typeOf: (node) => node.types,
    rangeIncludes: (node) => node.range_includes,
};

/** The arcs model.broader and model.narrower follow. */
const BROADER_ARCS: readonly ArcProperty[] = ['subClassOf', 'subPropertyOf', 'specializationOf'];

/** The StatVar arc each role is. */
const ROLE_ARC: Readonly<Record<Role, StatVarProperty>> = {
    measured: 'measuredProperty',
    between: 'observationProperties',
    split: 'constraintProperties',
};

const hasRole = (pattern: SchemaPattern, role: Role, id: string): boolean => {
    switch (role) {
        case 'measured':
            return pattern.measured_property === id;
        case 'between':
            return pattern.observation_properties.includes(id);
        case 'split':
            return pattern.constraint_properties.includes(id);
    }
};

/**
 * An arc box's link: the arcs among `arcs` that hold at least one entry, with
 * the centre as subject (`out`) or object (`in`).
 */
const arcVia = (
    model: Model,
    centre: string,
    ids: readonly string[],
    arcs: readonly ArcProperty[],
    direction: 'out' | 'in',
): Via => {
    const holds = (arc: ArcProperty, entry: string): boolean => {
        const [subject, object] = direction === 'out' ? [centre, entry] : [entry, centre];
        const node = model.node(subject);
        return node !== undefined && ARC_OBJECTS[arc](node).includes(object);
    };
    return Object.freeze({
        kind: 'arc',
        properties: Object.freeze(arcs.filter((arc) => ids.some((entry) => holds(arc, entry)))),
        direction,
    });
};

/** The class and every class narrower than it. */
const andNarrower = (model: Model, classId: string): Set<string> => {
    const seen = new Set([classId]);
    for (const next of seen) {
        for (const child of model.narrower(next)) seen.add(child);
    }
    return seen;
};

const patternsCache = new WeakMap<Model, readonly SchemaPattern[]>();

/** Every dataset's patterns, gathered once per model. */
const allPatterns = (model: Model): readonly SchemaPattern[] => {
    let patterns = patternsCache.get(model);
    if (patterns === undefined) {
        patterns = Object.freeze(model.datasets.flatMap((dataset) => dataset.patterns));
        patternsCache.set(model, patterns);
    }
    return patterns;
};

/** The patterns about a class or a narrower one, for its role boxes. */
const patternsAbout = (model: Model, classId: string): readonly SchemaPattern[] => {
    const about = andNarrower(model, classId);
    return allPatterns(model).filter(
        (pattern) => pattern.population_type !== null && about.has(pattern.population_type),
    );
};

/**
 * A class's role box, where StatVars about the class or a narrower one use each
 * entry in `role`. `about` holds the patterns about the class or a narrower one.
 */
const classRoleVia = (
    classId: string,
    role: Role,
    ids: readonly string[],
    about: readonly SchemaPattern[],
): Via => {
    const direct = new Set<string>();
    let statVars = 0;
    let kinds = false;
    for (const pattern of about) {
        const used = ids.filter((entry) => hasRole(pattern, role, entry));
        if (used.length === 0) continue;
        statVars += pattern.stat_var_count;
        if (pattern.population_type === classId) for (const entry of used) direct.add(entry);
        else kinds = true;
    }
    return Object.freeze({
        kind: 'statVars',
        centre: Object.freeze(['populationType'] as const),
        entries: Object.freeze([ROLE_ARC[role]]),
        statVars,
        kinds,
        kindsOnly: ids.filter((entry) => !direct.has(entry)).length,
    });
};

/** A property's "Used with" box, where StatVars about each entry use the property in some role. */
const usedWithVia = (model: Model, propertyId: string, ids: readonly string[]): Via => {
    const classes = new Set(ids);
    const roles = new Set<Role>();
    let statVars = 0;
    for (const pattern of allPatterns(model)) {
        if (pattern.population_type === null || !classes.has(pattern.population_type)) continue;
        const held = ROLES.filter((role) => hasRole(pattern, role, propertyId));
        if (held.length === 0) continue;
        statVars += pattern.stat_var_count;
        for (const role of held) roles.add(role);
    }
    return Object.freeze({
        kind: 'statVars',
        centre: Object.freeze(
            ROLES.filter((role) => roles.has(role)).map((role) => ROLE_ARC[role]),
        ),
        entries: Object.freeze(['populationType'] as const),
        statVars,
        kinds: false,
        kindsOnly: 0,
    });
};

/** A dataset's box, built from the dataset's StatVars that name an entry by `arc`. */
const datasetVia = (
    view: DatasetView,
    ids: readonly string[],
    arc: 'populationType' | Role,
): Via => {
    const uses = (pattern: SchemaPattern): boolean =>
        arc === 'populationType'
            ? pattern.population_type !== null && ids.includes(pattern.population_type)
            : ids.some((entry) => hasRole(pattern, arc, entry));
    return Object.freeze({
        kind: 'statVars',
        centre: null,
        entries: Object.freeze([arc === 'populationType' ? arc : ROLE_ARC[arc]]),
        statVars: view.patterns
            .filter(uses)
            .reduce((sum, pattern) => sum + pattern.stat_var_count, 0),
        kinds: false,
        kindsOnly: 0,
    });
};

const EACH = 'each of these';

/** The link in arrows, as the bubble shows it: "each of these → subClassOf → Country". */
const tripleText = (centre: string, side: Side, via: Via, label: (id: string) => string) => {
    switch (via.kind) {
        case 'arc': {
            const [subject, object] = via.direction === 'out' ? [centre, EACH] : [EACH, centre];
            return `${subject} → ${via.properties.join(' or ')} → ${object}`;
        }
        case 'valueList':
            return `${EACH} → rangeIncludes → ${label(via.list)} ← typeOf ← ${centre}`;
        case 'statVars': {
            const statVars =
                via.centre === null
                    ? `${plural(via.statVars, 'StatVar')} of ${centre}`
                    : plural(via.statVars, 'StatVar');
            const entries = via.entries.join(' or ');
            const centreEnd =
                via.centre === null
                    ? null
                    : [via.centre.join(' or '), via.kinds ? `${centre} or a kind of it` : centre];
            if (side === 'left') {
                const tail = centreEnd === null ? '' : ` · ${centreEnd[0]} → ${centreEnd[1]}`;
                return `${EACH} ← ${entries} · ${statVars}${tail}`;
            }
            const head = centreEnd === null ? '' : `${centreEnd[1]} ← ${centreEnd[0]} · `;
            return `${head}${statVars} · ${entries} → ${EACH}`;
        }
    }
};

/** The link as a sentence: "Graph link: each entry subClassOf Country." */
const sentenceText = (centre: string, via: Via, label: (id: string) => string): string => {
    switch (via.kind) {
        case 'arc': {
            const arcs = via.properties.join(' or ');
            return via.direction === 'out'
                ? `Graph link: ${centre} ${arcs} each entry.`
                : `Graph link: each entry ${arcs} ${centre}.`;
        }
        case 'valueList':
            return `Graph link: each entry rangeIncludes ${label(via.list)}, and ${centre} typeOf ${label(via.list)}.`;
        case 'statVars': {
            const statVars = plural(via.statVars, 'StatVar');
            const entries = via.entries.join(' or ');
            if (via.centre === null) {
                return `Graph link: ${statVars} of ${centre} have each entry as their ${entries}.`;
            }
            const arcs = via.centre.join(' or ');
            if (via.entries.includes('populationType')) {
                return `Graph link: ${statVars} have each entry as their ${entries} and ${centre} as their ${arcs}.`;
            }
            const about = via.kinds ? `${centre} or a kind of it` : centre;
            return `Graph link: ${statVars} have ${about} as their ${arcs} and each entry as their ${entries}.`;
        }
    }
};

type BoxSpec = {
    readonly key: string;
    readonly side: Side;
    readonly title: string;
    readonly ids: readonly string[];
    readonly via: Via;
    /** The join's words for a chain. An arc box reads its arcs' words. */
    readonly phrase?: string;
    readonly more?: FocusBox['more'];
    readonly values?: FocusBox['values'];
};

/** A box with its join words, bubble text and sentence, all read from `via`. */
const box = (centre: string, label: (id: string) => string, spec: BoxSpec): FocusBox => {
    const { via } = spec;
    const join =
        via.kind === 'arc'
            ? via.properties.map((arc) => ARC_WORDS[arc]).join(' or ')
            : (spec.phrase ?? '');
    const note =
        via.kind === 'statVars' && via.kindsOnly > 0
            ? `${count(via.kindsOnly)} of these only through StatVars about kinds of ${centre}.`
            : null;
    const sentence = sentenceText(centre, via, label);
    return Object.freeze({
        key: spec.key,
        side: spec.side,
        title: spec.title,
        join,
        via,
        triple: tripleText(centre, spec.side, via, label),
        note,
        sentence: note === null ? sentence : `${sentence} ${note}`,
        ids: Object.freeze([...spec.ids]),
        more: spec.more ?? 'panel',
        values: spec.values ?? null,
    });
};

const boxesCache = new WeakMap<Model, Map<string, readonly FocusBox[]>>();

/**
 * The boxes around a term the model holds, empty boxes left out. An id the
 * model lacks gets []. Each model computes a term's boxes once.
 */
export function nodeBoxes(model: Model, id: string): readonly FocusBox[] {
    let byId = boxesCache.get(model);
    if (byId === undefined) {
        byId = new Map();
        boxesCache.set(model, byId);
    }
    const cached = byId.get(id);
    if (cached !== undefined) return cached;
    const boxes = buildNodeBoxes(model, id);
    byId.set(id, boxes);
    return boxes;
}

function buildNodeBoxes(model: Model, id: string): readonly FocusBox[] {
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
    const make = (spec: BoxSpec) => box(model.label(id), model.label, spec);
    const broaderBox = (title: string, ids: readonly string[]) =>
        make({
            key: 'up',
            side: 'up',
            title,
            ids,
            via: arcVia(model, id, ids, BROADER_ARCS, 'out'),
        });
    const narrowerBox = (title: string) =>
        make({
            key: 'down',
            side: 'down',
            title,
            ids: narrower,
            via: arcVia(model, id, narrower, BROADER_ARCS, 'in'),
        });
    const rangeBox = (key: string, title: string, ids: readonly string[]) =>
        make({
            key,
            side: 'left',
            title,
            ids,
            via: arcVia(model, id, ids, ['rangeIncludes'], 'in'),
        });

    // The properties StatVars about the term use, by role: a class's, or a UN series' (a value).
    const roleBoxes = (more: FocusBox['more']): FocusBox[] => {
        const { groups } = model.propertiesOf(id);
        const about = patternsAbout(model, id);
        const role = (group: Role, title: string, phrase: string) => {
            const ids = groups[group].map((entry) => entry.id);
            return make({
                key: group,
                side: 'right',
                title,
                ids,
                via: classRoleVia(id, group, ids, about),
                phrase,
                more,
            });
        };
        return [
            role('measured', 'What is measured', 'measured as'),
            role('between', 'Between whom', 'between'),
            role('split', 'Split by', 'split by'),
        ];
    };

    const boxes: FocusBox[] = [];
    switch (kind) {
        case 'class': {
            boxes.push(
                broaderBox('A kind of', model.byUse(ofKind(model.broader(id)))),
                rangeBox(
                    'left',
                    'It can be the value of',
                    model.byUse(model.propertiesWithRange(id)),
                ),
                ...roleBoxes('list'),
                narrowerBox('Kinds of it'),
            );
            break;
        }
        case 'property': {
            const usedWith = model.usedWith(id).map((use) => use.classId);
            const range = model.byUse(model.node(id)?.range_includes ?? []);
            boxes.push(
                broaderBox('Narrows', model.byUse(model.broader(id))),
                make({
                    key: 'left',
                    side: 'left',
                    title: 'Used with',
                    ids: usedWith,
                    via: usedWithVia(model, id, usedWith),
                    phrase: 'has',
                }),
                make({
                    key: 'right',
                    side: 'right',
                    title: 'Takes its value from',
                    ids: range,
                    via: arcVia(model, id, range, ['rangeIncludes'], 'out'),
                }),
                narrowerBox('Narrowed by'),
            );
            break;
        }
        case 'valueList':
            boxes.push(
                broaderBox('Part of', model.byUse(ofKind(model.broader(id)))),
                rangeBox('left', 'Set with', model.byUse(model.propertiesWithRange(id))),
                narrowerBox('Narrower lists'),
            );
            break;
        case 'value': {
            const list = model.valueListOf(id);
            const lists = list === undefined ? [] : [list];
            boxes.push(
                make({
                    key: 'list',
                    side: 'up',
                    title: 'Value list',
                    ids: lists,
                    via: arcVia(model, id, lists, ['typeOf'], 'out'),
                }),
                broaderBox('Broader value', model.byUse(ofKind(model.broader(id)))),
            );
            if (list !== undefined) {
                boxes.push(
                    make({
                        key: 'left',
                        side: 'left',
                        title: 'Set with',
                        ids: model.byUse(model.propertiesWithRange(list)),
                        via: { kind: 'valueList', list },
                        phrase: 'takes this value',
                    }),
                );
            }
            // A value has no scoped list, so "All N" opens the panel.
            if (model.isPopulationType(id)) boxes.push(...roleBoxes('panel'));
            boxes.push(narrowerBox('Narrower values'));
            break;
        }
    }
    return Object.freeze(boxes.filter((entry) => entry.ids.length > 0));
}
/**
 * How many properties a class declares that no dataset's pattern about it
 * uses. 0 for any other id.
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
    const splits = view.splits.map((split) => split.property);
    const make = (spec: BoxSpec) => box(view.label, (id) => id, spec);
    const used = (
        key: string,
        side: Side,
        title: string,
        phrase: string,
        ids: readonly string[],
        arc: 'populationType' | Role,
    ) => make({ key, side, title, ids, phrase, via: datasetVia(view, ids, arc) });
    const boxes = [
        used('about', 'left', 'What it is about', 'about', view.populationTypes, 'populationType'),
        used('measured', 'right', 'What it measures', 'measures', view.measured, 'measured'),
        used('between', 'right', 'Between whom', 'between', view.between, 'between'),
        make({
            key: 'split',
            side: 'right',
            title: 'Split by',
            ids: splits,
            phrase: 'split by',
            via: datasetVia(view, splits, 'split'),
            values,
        }),
    ];
    return Object.freeze(boxes.filter((entry) => entry.ids.length > 0));
}

/**
 * A property's declared domain when it differs from the classes the picture
 * shows it used with. Null when the two hold the same classes or the
 * property declares none.
 */
export function declaredDomain(model: Model, id: string): readonly string[] | null {
    const domain = model.node(id)?.domain_includes ?? [];
    if (domain.length === 0) return null;
    const used = new Set(model.usedWith(id).map((use) => use.classId));
    const same = domain.length === used.size && domain.every((classId) => used.has(classId));
    return same ? null : domain;
}

/**
 * One value of an open property as the panel shows it: a link to a node the
 * model holds, named as the value-list table names it, else text.
 */
export type OpenEntryValue =
    | { readonly kind: 'node'; readonly id: string; readonly name: string }
    | { readonly kind: 'text'; readonly text: string };

/** One open property of a node with its label and values. */
export type OpenEntry = {
    readonly property: string;
    /** The property's name when the model holds it, else its dcid. */
    readonly label: string;
    readonly values: readonly OpenEntryValue[];
};

/**
 * A node's open properties in the document's order. A dcid value the model
 * holds as a node or dataset is a `node`, named by its plain name
 * (plainName), or by its full label where two values of the line share a
 * plain name, as openColumns names a reference. Any other dcid and every
 * literal is `text`. Empty for a node the model lacks.
 */
export function openEntries(model: Model, id: string): readonly OpenEntry[] {
    const node = model.node(id);
    if (!node) return [];
    return Object.entries(node.other_properties).map(([property, values]) => {
        const held = new Set(
            values.flatMap((value) =>
                'ref' in value && (model.node(value.ref) || model.dataset(value.ref))
                    ? [value.ref]
                    : [],
            ),
        );
        const sharing = new Map<string, number>();
        for (const ref of held) {
            const name = plainName(model, ref);
            sharing.set(name, (sharing.get(name) ?? 0) + 1);
        }
        const nameOf = (ref: string): string => {
            const name = plainName(model, ref);
            return (sharing.get(name) ?? 0) > 1 ? model.label(ref) : name;
        };
        return {
            property,
            label: model.label(property),
            values: values.map((value): OpenEntryValue => {
                if ('value' in value) return { kind: 'text', text: value.value };
                return held.has(value.ref)
                    ? { kind: 'node', id: value.ref, name: nameOf(value.ref) }
                    : { kind: 'text', text: value.ref };
            }),
        };
    });
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
    /**
     * The origin declaring the centre, as a node's `declared_by`, for the tag
     * after its name (termOrigin). Null for a dataset and for a term whose
     * origin nothing loaded names.
     */
    readonly declaredBy: string | null;
};

/**
 * What a term the model knows only from a usage document's `terms` is, read
 * from its types: a Class, a Property, or a value such as a UN series, read
 * as kindWords reads a value, so a series reads as its series class. "Not in
 * the DFO model" when no usage document names it.
 */
export const termKindWords = (model: Model, term: UsageTerm | undefined): string => {
    if (term === undefined) return 'Not in the DFO model';
    if (term.types.includes('Class')) return KIND_WORDS.class;
    if (term.types.includes('Property')) return KIND_WORDS.property;
    return kindWords(model, 'value', term.types);
};

/**
 * The heading for a centred dataset, a term the model holds as a node, a
 * term it knows only from a usage document (`model.term`), or a term only a
 * loaded terms list holds, named by its label or else its dcid. A term's
 * origin is termOrigin's over `sources`, or its node's alone without them.
 * A term the model holds no node for has its kind followed by where its
 * origin sits, such as "Property in the UN System Data Commons", so two
 * terms with one label read apart. Null for a dataset the model lacks.
 */
export function centreHeading(
    model: Model,
    centre: Centre,
    sources: TermSources = { usage: {}, terms: [] },
): CentreHeading | null {
    if (centre.kind === 'dataset') {
        const view = model.datasetView(centre.id);
        if (!view) return null;
        return {
            kind: KIND_WORDS.dataset,
            name: view.label,
            sub: { kind: 'statVars', count: view.statVarCount },
            declaredBy: null,
        };
    }
    const declaredBy = termOrigin(model, sources, centre.id);
    const kind = model.kind(centre.id);
    if (kind !== undefined) {
        const node = model.node(centre.id);
        const codes = node?.classification_code ?? [];
        return {
            kind: kindWords(model, kind, node?.types ?? []),
            name: model.label(centre.id),
            sub: codes.length > 0 ? { kind: 'codes', codes } : null,
            declaredBy,
        };
    }
    const term = model.term(centre.id);
    const row = term === undefined ? outsideTerm(sources.terms, centre.id) : undefined;
    const words = row === undefined ? termKindWords(model, term) : KIND_WORDS[kindOfTerm(row)];
    const known = term !== undefined || row !== undefined;
    return {
        kind: known && declaredBy !== null ? `${words} ${declarerPlace(declaredBy)}` : words,
        name: row?.label ?? model.label(centre.id),
        sub: { kind: 'dcid', id: centre.id },
        declaredBy,
    };
}

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
 * least 1, so a small share does not round down to none.
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

/** An observation period in words with its code, "Yearly (P1Y)". Any other code comes back as it is. */
export const periodText = (code: string): string => {
    const words = PERIOD_WORDS[code];
    return words === undefined ? code : `${words} (${code})`;
};
