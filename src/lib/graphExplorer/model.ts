/**
 * The knowledge-graph model as one immutable index over two documents: the
 * ontology (terms and how they relate) and the provenances (how each dataset's
 * StatVars use those terms). Every answer is derived from the documents.
 *
 * Words for readers: a Class is a `class`, a Class with an enumeration is a
 * `valueList`, a Property is a `property`, any other node is a `value`, and a
 * provenance of the provenances document is a `dataset`.
 */
import type {
    OntologyDocument,
    OntologyNode,
    OntologyPattern,
    OntologyProvenance,
    OntologyProvenances,
} from './wire.ts';

export type Kind = 'class' | 'valueList' | 'property' | 'value';

/**
 * What a property does in a StatVar, read from the patterns that use it:
 * `measured` is a pattern's measured property, `between` an observation
 * property, `split` a constraint property.
 */
export type Role = 'measured' | 'between' | 'split';

/** A role, or `unused` for a property no pattern in scope uses. */
export type Group = Role | 'unused';

export const ROLES: readonly Role[] = ['measured', 'between', 'split'];
export const GROUPS: readonly Group[] = [...ROLES, 'unused'];

/** A StatVar count in one dataset. */
export type DatasetCount = { readonly dataset: string; readonly count: number };

/** How many StatVars use a node, per dataset (largest first) and in total. */
export type Usage = { readonly byDataset: readonly DatasetCount[]; readonly total: number };

/** A class a property is used with, and how many StatVars use the two together. */
export type ClassCount = { readonly classId: string; readonly count: number };

/** One member of a value list with its narrower members. */
export type MemberTree = { readonly id: string; readonly children: readonly MemberTree[] };

/**
 * How many members of a value list one dataset uses: `used` of `of`.
 * `truncated` is true when the document lists only part of the list.
 */
export type ValuesUsed = {
    readonly used: number;
    readonly of: number;
    readonly truncated: boolean;
};

/** One property of a class, with the roles it has in patterns about that class. */
export type ClassProperty = {
    readonly id: string;
    /** The ancestor whose `domain_includes` names the property; null when the class's own does or none does. */
    readonly inheritedFrom: string | null;
    /** Whether `domain_includes` on the class or an ancestor names the property. */
    readonly declared: boolean;
    readonly roles: readonly Role[];
};

/** A class's properties placed by group, each group most used first. */
export type ClassProperties = {
    readonly all: readonly ClassProperty[];
    readonly groups: Readonly<Record<Group, readonly ClassProperty[]>>;
};

/** A population type with how many datasets and StatVars use it. */
export type PopulationTypeUse = {
    readonly classId: string;
    readonly datasets: number;
    readonly statVars: number;
};

/** A capped list: the first `limit` entries and how many there are in all. */
export type Top = { readonly items: readonly string[]; readonly total: number };

/** A split-by property of a dataset with the members of its value list the dataset uses. */
export type DatasetSplit = { readonly property: string; readonly values: ValuesUsed | null };

/** A dataset seen as a node of the model. */
export type DatasetView = {
    readonly id: string;
    readonly label: string;
    readonly description: string | null;
    readonly statVarCount: number;
    readonly patterns: readonly OntologyPattern[];
    /** Each list is ordered by the StatVars that use the entry in this dataset, largest first. */
    readonly populationTypes: readonly string[];
    readonly measured: readonly string[];
    readonly between: readonly string[];
    readonly splits: readonly DatasetSplit[];
};

/** The properties a scoped list covers: one class's, or every instance-declared property. */
export type ListScope =
    { readonly kind: 'class'; readonly id: string } | { readonly kind: 'instance' };

/** Which datasets a scoped list counts: none chosen, one, or every dataset as a column. */
export type DatasetFilter =
    | { readonly kind: 'none' }
    | { readonly kind: 'dataset'; readonly id: string }
    | { readonly kind: 'all' };

export type ScopedRow = {
    readonly id: string;
    readonly roles: readonly Role[];
    /** Set in a class scope when the property comes from an ancestor's domain. */
    readonly inheritedFrom: string | null;
    readonly usedWith: readonly ClassCount[];
    readonly domain: readonly string[];
    readonly valueList: string | null;
    readonly usage: Usage;
    /** One count per entry of the list's `columns`, in that order. */
    readonly counts: readonly number[];
    /** With one dataset chosen, the members of the value list it uses; null otherwise. */
    readonly values: ValuesUsed | null;
};

export type ScopedList = {
    readonly scope: ListScope;
    readonly filter: DatasetFilter;
    /** Dataset ids with a count column: the chosen one, every one, or none. */
    readonly columns: readonly string[];
    readonly total: number;
    readonly groups: Readonly<Record<Group, readonly ScopedRow[]>>;
};

/** Whether one dataset uses a node, and for a value list how many members. */
export type LensEntry = {
    readonly id: string;
    readonly count: number;
    readonly used: boolean;
    readonly members: ValuesUsed | null;
};

export type Model = {
    readonly generation: string | null;
    /** Every node, sorted by dcid. */
    readonly nodes: readonly OntologyNode[];
    /** Every dataset, in document order. */
    readonly datasets: readonly OntologyProvenance[];
    node(id: string): OntologyNode | undefined;
    dataset(id: string): OntologyProvenance | undefined;
    kind(id: string): Kind | undefined;
    /** The name, else the dcid; a dataset's name by `datasetName`. */
    label(id: string): string;
    isBase(id: string): boolean;
    /** `sub_class_of`, `sub_property_of` and `specialization_of`. */
    broader(id: string): readonly string[];
    /** Nodes whose broader terms include `id`, by label. */
    narrower(id: string): readonly string[];
    /** Broader terms closed transitively, nearest first. */
    ancestors(id: string): readonly string[];
    /** The value list a value is a member of, or undefined. */
    valueListOf(id: string): string | undefined;
    /** The first value list in a property's `range_includes`, or undefined. */
    valueListOfProperty(id: string): string | undefined;
    /** A value list's members, by classification code then label. */
    members(listId: string): readonly string[];
    /** A value list's members as a tree by `specialization_of`, roots first. */
    memberTree(listId: string): readonly MemberTree[];
    /** Properties whose `domain_includes` names the class. */
    propertiesWithDomain(classId: string): readonly string[];
    /** Properties whose `range_includes` names the node. */
    propertiesWithRange(id: string): readonly string[];
    usage(id: string): Usage;
    /** StatVars in one dataset that use the node. */
    usageIn(id: string, datasetId: string): number;
    /** A property's roles over every dataset, or over one. Empty when no pattern uses it. */
    roles(id: string, datasetId?: string): readonly Role[];
    /** The population types of the patterns that use a property, most StatVars first. */
    usedWith(id: string): readonly ClassCount[];
    /** The population types the datasets' patterns name: most datasets first, then most StatVars. */
    populationTypes(): readonly PopulationTypeUse[];
    propertiesOf(classId: string): ClassProperties;
    topByUse(ids: Iterable<string>, limit?: number): Top;
    datasetView(id: string): DatasetView | undefined;
    valuesUsed(datasetId: string, propertyId: string): ValuesUsed | null;
    scopedList(scope: ListScope, filter: DatasetFilter): ScopedList;
    lens(datasetId: string, ids: Iterable<string>): readonly LensEntry[];
};

const EMPTY: readonly string[] = Object.freeze([]);
const NO_USAGE: Usage = Object.freeze({ byDataset: Object.freeze([]), total: 0 });

const kindOf = (node: OntologyNode): Kind => {
    if (node.types.includes('Class')) return node.enumeration ? 'valueList' : 'class';
    if (node.types.includes('Property')) return 'property';
    return 'value';
};

/** The node ids a pattern names, each once. */
const patternIds = (pattern: OntologyPattern): Set<string> => {
    const ids = [
        pattern.population_type,
        pattern.measured_property,
        pattern.stat_type,
        pattern.measurement_qualifier,
        pattern.measurement_denominator,
        ...pattern.constraint_properties,
        ...pattern.observation_properties,
    ];
    return new Set(ids.filter((id): id is string => id !== null));
};

/** The roles each property has in one pattern. */
const patternRoles = (pattern: OntologyPattern): [string, Role][] => [
    [pattern.measured_property, 'measured'],
    ...pattern.observation_properties.map((id): [string, Role] => [id, 'between']),
    ...pattern.constraint_properties.map((id): [string, Role] => [id, 'split']),
];

const orderRoles = (roles: Iterable<Role>): readonly Role[] => {
    const held = new Set(roles);
    return Object.freeze(ROLES.filter((role) => held.has(role)));
};

const push = <TKey, TValue>(map: Map<TKey, TValue[]>, key: TKey, value: TValue) => {
    const entries = map.get(key);
    if (entries) entries.push(value);
    else map.set(key, [value]);
};

const groupBy = <TItem extends { readonly roles: readonly Role[] }>(
    items: readonly TItem[],
): Readonly<Record<Group, readonly TItem[]>> => {
    const groups: Record<Group, TItem[]> = { measured: [], between: [], split: [], unused: [] };
    for (const item of items) groups[item.roles[0] ?? 'unused'].push(item);
    for (const group of GROUPS) Object.freeze(groups[group]);
    return Object.freeze(groups);
};

/** A dataset's label, else the last path segment of its dcid. */
export const datasetName = (dataset: Pick<OntologyProvenance, 'dcid' | 'label'>): string =>
    dataset.label ?? dataset.dcid.split('/').at(-1) ?? dataset.dcid;

/** The index over an ontology document and a provenances document. */
export function buildModel(ontology: OntologyDocument, provenances: OntologyProvenances): Model {
    const nodes = Object.freeze(ontology.nodes.toSorted((a, b) => (a.dcid < b.dcid ? -1 : 1)));
    const datasets = Object.freeze([...provenances.provenances]);
    const byId = new Map(nodes.map((node) => [node.dcid, node]));
    const datasetById = new Map(datasets.map((dataset) => [dataset.dcid, dataset]));
    const kinds = new Map(nodes.map((node) => [node.dcid, kindOf(node)]));

    const label = (id: string): string => {
        const name = byId.get(id)?.name;
        if (name) return name;
        const dataset = datasetById.get(id);
        return dataset ? datasetName(dataset) : id;
    };
    const byLabel = (a: string, b: string): number =>
        label(a).localeCompare(label(b), 'en') || (a < b ? -1 : a > b ? 1 : 0);

    // Relations between terms.
    const broaderOf = new Map<string, readonly string[]>();
    const narrowerOf = new Map<string, string[]>();
    const membersOf = new Map<string, Set<string>>();
    const domainOf = new Map<string, string[]>();
    const rangeOf = new Map<string, string[]>();

    for (const node of nodes) {
        const broader = [
            ...new Set([...node.sub_class_of, ...node.sub_property_of, ...node.specialization_of]),
        ];
        broaderOf.set(node.dcid, Object.freeze(broader));
        for (const id of broader) push(narrowerOf, id, node.dcid);
        if (kinds.get(node.dcid) === 'property') {
            for (const id of node.domain_includes) push(domainOf, id, node.dcid);
            for (const id of node.range_includes) push(rangeOf, id, node.dcid);
        }
        for (const id of node.enumeration?.members ?? []) {
            membersOf.set(node.dcid, (membersOf.get(node.dcid) ?? new Set()).add(id));
        }
    }
    // A value typed by a value list belongs to it whether or not the list's member read reached it.
    for (const node of nodes) {
        if (kinds.get(node.dcid) !== 'value') continue;
        for (const type of node.types) {
            if (kinds.get(type) === 'valueList') {
                membersOf.set(type, (membersOf.get(type) ?? new Set()).add(node.dcid));
            }
        }
    }

    const byCode = (a: string, b: string): number => {
        const code = (id: string) => byId.get(id)?.classification_code[0];
        const [codeA, codeB] = [code(a), code(b)];
        if (codeA !== undefined && codeB !== undefined) {
            const order = codeA.localeCompare(codeB, 'en', { numeric: true });
            if (order) return order;
        } else if (codeA !== undefined || codeB !== undefined) {
            return codeA === undefined ? 1 : -1;
        }
        return byLabel(a, b);
    };

    const sortedIndex = (map: Map<string, string[] | Set<string>>, order = byLabel) =>
        new Map([...map].map(([key, ids]) => [key, Object.freeze([...ids].sort(order))]));
    const narrowerIndex = sortedIndex(narrowerOf);
    const membersIndex = sortedIndex(membersOf, byCode);
    const domainIndex = sortedIndex(domainOf);
    const rangeIndex = sortedIndex(rangeOf);

    const valueListOf = (id: string): string | undefined =>
        byId.get(id)?.types.find((type) => kinds.get(type) === 'valueList');
    const valueListOfProperty = (id: string): string | undefined =>
        byId.get(id)?.range_includes.find((range) => kinds.get(range) === 'valueList');

    // Both walks append to the array they iterate; for...of reaches the appended entries.
    const ancestors = (id: string): readonly string[] => {
        const seen = new Set<string>();
        const queue = [...(broaderOf.get(id) ?? EMPTY)];
        for (const next of queue) {
            if (next === id || seen.has(next)) continue;
            seen.add(next);
            queue.push(...(broaderOf.get(next) ?? EMPTY));
        }
        return Object.freeze([...seen]);
    };

    const descendants = (id: string): Set<string> => {
        const seen = new Set([id]);
        const queue = [id];
        for (const next of queue) {
            for (const child of narrowerIndex.get(next) ?? EMPTY) {
                if (!seen.has(child)) {
                    seen.add(child);
                    queue.push(child);
                }
            }
        }
        return seen;
    };

    const memberTree = (listId: string): readonly MemberTree[] => {
        const members = membersIndex.get(listId) ?? EMPTY;
        const inList = new Set(members);
        const children = new Map<string, string[]>();
        const roots: string[] = [];
        for (const id of members) {
            const parents = (byId.get(id)?.specialization_of ?? []).filter((p) => inList.has(p));
            if (parents.length === 0) roots.push(id);
            for (const parent of parents) push(children, parent, id);
        }
        const build = (id: string, path: Set<string>): MemberTree =>
            Object.freeze({
                id,
                children: Object.freeze(
                    (children.get(id) ?? [])
                        .filter((child) => !path.has(child))
                        .map((child) => build(child, new Set(path).add(child))),
                ),
            });
        return Object.freeze(roots.map((id) => build(id, new Set([id]))));
    };

    // Usage: StatVar counts per node and dataset.
    const counts = new Map<string, Map<string, number>>();
    const roleIndex = new Map<string, Map<string, Set<Role>>>();
    const patterns: { dataset: string; pattern: OntologyPattern }[] = [];
    const constraintValues = new Map<string, Map<string, readonly string[]>>();

    const add = (id: string, dataset: string, count: number, combine: 'sum' | 'max') => {
        const perDataset = counts.get(id) ?? new Map<string, number>();
        const held = perDataset.get(dataset) ?? 0;
        perDataset.set(dataset, combine === 'sum' ? held + count : Math.max(held, count));
        counts.set(id, perDataset);
    };

    for (const dataset of datasets) {
        for (const pattern of dataset.patterns) {
            patterns.push({ dataset: dataset.dcid, pattern });
            for (const id of patternIds(pattern)) {
                add(id, dataset.dcid, pattern.stat_var_count, 'sum');
            }
            for (const [id, role] of patternRoles(pattern)) {
                const perDataset = roleIndex.get(id) ?? new Map<string, Set<Role>>();
                perDataset.set(dataset.dcid, (perDataset.get(dataset.dcid) ?? new Set()).add(role));
                roleIndex.set(id, perDataset);
            }
        }
        const values = new Map<string, readonly string[]>();
        for (const constraint of dataset.constraint_values) {
            values.set(
                constraint.property,
                Object.freeze(constraint.values.map((value) => value.value)),
            );
            // A value can also sit in a pattern field; the larger count stands, which never
            // counts one StatVar twice.
            for (const value of constraint.values) {
                add(value.value, dataset.dcid, value.stat_var_count, 'max');
            }
        }
        constraintValues.set(dataset.dcid, values);
    }

    const usageCache = new Map<string, Usage>();
    const usage = (id: string): Usage => {
        const cached = usageCache.get(id);
        if (cached) return cached;
        const perDataset = counts.get(id);
        if (!perDataset) return NO_USAGE;
        const byDataset = [...perDataset]
            .map(([dataset, count]) => Object.freeze({ dataset, count }))
            .sort((a, b) => b.count - a.count || byLabel(a.dataset, b.dataset));
        const result = Object.freeze({
            byDataset: Object.freeze(byDataset),
            total: byDataset.reduce((sum, entry) => sum + entry.count, 0),
        });
        usageCache.set(id, result);
        return result;
    };
    const usageIn = (id: string, datasetId: string): number => counts.get(id)?.get(datasetId) ?? 0;

    const roles = (id: string, datasetId?: string): readonly Role[] => {
        const perDataset = roleIndex.get(id);
        if (!perDataset) return orderRoles([]);
        if (datasetId !== undefined) return orderRoles(perDataset.get(datasetId) ?? []);
        return orderRoles([...perDataset.values()].flatMap((held) => [...held]));
    };

    const usedWith = (id: string): readonly ClassCount[] => {
        const totals = new Map<string, number>();
        for (const { pattern } of patterns) {
            if (pattern.population_type === null) continue;
            if (!patternRoles(pattern).some(([property]) => property === id)) continue;
            totals.set(
                pattern.population_type,
                (totals.get(pattern.population_type) ?? 0) + pattern.stat_var_count,
            );
        }
        return Object.freeze(
            [...totals]
                .map(([classId, count]) => Object.freeze({ classId, count }))
                .sort((a, b) => b.count - a.count || byLabel(a.classId, b.classId)),
        );
    };

    const populationTypes: readonly PopulationTypeUse[] = (() => {
        const datasetsOf = new Map<string, Set<string>>();
        const statVars = new Map<string, number>();
        for (const { dataset, pattern } of patterns) {
            const id = pattern.population_type;
            if (id === null) continue;
            datasetsOf.set(id, (datasetsOf.get(id) ?? new Set()).add(dataset));
            statVars.set(id, (statVars.get(id) ?? 0) + pattern.stat_var_count);
        }
        return Object.freeze(
            [...datasetsOf]
                .map(([classId, using]) =>
                    Object.freeze({
                        classId,
                        datasets: using.size,
                        statVars: statVars.get(classId) ?? 0,
                    }),
                )
                .sort(
                    (a, b) =>
                        b.datasets - a.datasets ||
                        b.statVars - a.statVars ||
                        byLabel(a.classId, b.classId),
                ),
        );
    })();

    const byUse = (a: string, b: string): number =>
        usage(b).total - usage(a).total || byLabel(a, b);

    const topByUse = (ids: Iterable<string>, limit = 8): Top => {
        const ordered = [...new Set(ids)].sort(byUse);
        return Object.freeze({
            items: Object.freeze(ordered.slice(0, limit)),
            total: ordered.length,
        });
    };

    const propertiesOf = (classId: string): ClassProperties => {
        const own = new Set(domainIndex.get(classId) ?? EMPTY);
        const inherited = new Map<string, string>();
        for (const ancestor of ancestors(classId)) {
            for (const id of domainIndex.get(ancestor) ?? EMPTY) {
                if (!own.has(id) && !inherited.has(id)) inherited.set(id, ancestor);
            }
        }
        // Roles count patterns about the class or a narrower class.
        const about = descendants(classId);
        const used = new Map<string, Set<Role>>();
        for (const { pattern } of patterns) {
            if (pattern.population_type === null || !about.has(pattern.population_type)) continue;
            for (const [id, role] of patternRoles(pattern)) {
                used.set(id, (used.get(id) ?? new Set()).add(role));
            }
        }
        const ids = [...new Set([...own, ...inherited.keys(), ...used.keys()])].sort(byUse);
        const all = Object.freeze(
            ids.map((id) =>
                Object.freeze({
                    id,
                    inheritedFrom: inherited.get(id) ?? null,
                    declared: own.has(id) || inherited.has(id),
                    roles: orderRoles(used.get(id) ?? []),
                }),
            ),
        );
        return Object.freeze({ all, groups: groupBy(all) });
    };

    const valuesUsed = (datasetId: string, propertyId: string): ValuesUsed | null => {
        const list = valueListOfProperty(propertyId);
        const values = constraintValues.get(datasetId)?.get(propertyId);
        if (list === undefined || values === undefined) return null;
        const members = membersIndex.get(list) ?? EMPTY;
        const inList = new Set(members);
        return Object.freeze({
            used: values.filter((value) => inList.has(value)).length,
            of: members.length,
            truncated: byId.get(list)?.enumeration?.truncated ?? false,
        });
    };

    const datasetView = (id: string): DatasetView | undefined => {
        const dataset = datasetById.get(id);
        if (!dataset) return undefined;
        const counted = new Map<Group | 'population', Map<string, number>>();
        const tally = (key: Group | 'population', property: string, count: number) => {
            const totals = counted.get(key) ?? new Map<string, number>();
            totals.set(property, (totals.get(property) ?? 0) + count);
            counted.set(key, totals);
        };
        for (const pattern of dataset.patterns) {
            if (pattern.population_type !== null) {
                tally('population', pattern.population_type, pattern.stat_var_count);
            }
            for (const [property, role] of patternRoles(pattern)) {
                tally(role, property, pattern.stat_var_count);
            }
        }
        const ordered = (key: Group | 'population'): readonly string[] =>
            Object.freeze(
                [...(counted.get(key) ?? [])]
                    .sort((a, b) => b[1] - a[1] || byLabel(a[0], b[0]))
                    .map(([property]) => property),
            );
        return Object.freeze({
            id,
            label: label(id),
            description: dataset.description,
            statVarCount: dataset.stat_var_count,
            patterns: dataset.patterns,
            populationTypes: ordered('population'),
            measured: ordered('measured'),
            between: ordered('between'),
            splits: Object.freeze(
                ordered('split').map((property) =>
                    Object.freeze({ property, values: valuesUsed(id, property) }),
                ),
            ),
        });
    };

    const scopedList = (scope: ListScope, filter: DatasetFilter): ScopedList => {
        const entries: { id: string; roles: readonly Role[]; inheritedFrom: string | null }[] =
            scope.kind === 'class'
                ? [...propertiesOf(scope.id).all]
                : nodes
                      .filter(
                          (node) =>
                              kinds.get(node.dcid) === 'property' &&
                              node.declared_by === 'instance',
                      )
                      .map((node) => ({
                          id: node.dcid,
                          roles: roles(node.dcid),
                          inheritedFrom: null,
                      }))
                      .sort((a, b) => byUse(a.id, b.id));
        const columns = Object.freeze(
            filter.kind === 'dataset'
                ? [filter.id]
                : filter.kind === 'all'
                  ? datasets.map((dataset) => dataset.dcid)
                  : [],
        );
        const rows = entries.map((entry): ScopedRow =>
            Object.freeze({
                id: entry.id,
                roles: entry.roles,
                inheritedFrom: entry.inheritedFrom,
                usedWith: usedWith(entry.id),
                domain: byId.get(entry.id)?.domain_includes ?? EMPTY,
                valueList: valueListOfProperty(entry.id) ?? null,
                usage: usage(entry.id),
                counts: Object.freeze(columns.map((dataset) => usageIn(entry.id, dataset))),
                values: filter.kind === 'dataset' ? valuesUsed(filter.id, entry.id) : null,
            }),
        );
        return Object.freeze({
            scope,
            filter,
            columns,
            total: rows.length,
            groups: groupBy(rows),
        });
    };

    const lens = (datasetId: string, ids: Iterable<string>): readonly LensEntry[] =>
        Object.freeze(
            [...ids].map((id) => {
                const count = usageIn(id, datasetId);
                let members: ValuesUsed | null = null;
                if (kinds.get(id) === 'valueList') {
                    const listed = membersIndex.get(id) ?? EMPTY;
                    members = Object.freeze({
                        used: listed.filter((member) => usageIn(member, datasetId) > 0).length,
                        of: listed.length,
                        truncated: byId.get(id)?.enumeration?.truncated ?? false,
                    });
                }
                return Object.freeze({
                    id,
                    count,
                    used: count > 0 || (members?.used ?? 0) > 0,
                    members,
                });
            }),
        );

    return Object.freeze({
        generation: ontology.generation,
        nodes,
        datasets,
        node: (id: string) => byId.get(id),
        dataset: (id: string) => datasetById.get(id),
        kind: (id: string) => kinds.get(id),
        label,
        isBase: (id: string) => byId.get(id)?.declared_by === 'base',
        broader: (id: string) => broaderOf.get(id) ?? EMPTY,
        narrower: (id: string) => narrowerIndex.get(id) ?? EMPTY,
        ancestors,
        valueListOf,
        valueListOfProperty,
        members: (listId: string) => membersIndex.get(listId) ?? EMPTY,
        memberTree,
        propertiesWithDomain: (classId: string) => domainIndex.get(classId) ?? EMPTY,
        propertiesWithRange: (id: string) => rangeIndex.get(id) ?? EMPTY,
        usage,
        usageIn,
        roles,
        usedWith,
        populationTypes: () => populationTypes,
        propertiesOf,
        topByUse,
        datasetView,
        valuesUsed,
        scopedList,
        lens,
    });
}
