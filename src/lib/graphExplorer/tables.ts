/**
 * Explore's lists as rows for a CSV file: a scoped list as shown, and a
 * value list's members.
 */
import { columnsByUse } from './lists.ts';
import type { Model, ScopedList } from './model.ts';
import { declarerWords, filterScopedList, GROUPS, membersHaveCodes, openColumns } from './model.ts';
import { patternGroups } from './sentence.ts';
import { csvFileName } from './sheet.ts';
import type { ProvenanceUsage } from './wire.ts';

/**
 * The rows of a scoped list that the filter text keeps (filterScopedList),
 * group by group, under a header. The counts are the StatVar total, or one
 * column per dataset the list counts, in the table's order (columnsByUse),
 * headed by the dataset's label. Labels two columns share carry the words
 * for each dataset's origin, read by `origin` as a node's `declared_by`
 * with null for the DFO's, and labels two columns of one origin share
 * also carry the dataset's dcid.
 */
export function scopedListTable(
    model: Model,
    list: ScopedList,
    {
        filter = '',
        origin = () => null,
    }: { filter?: string; origin?: (dataset: ProvenanceUsage) => string | null } = {},
): readonly (readonly string[])[] {
    const groups = filterScopedList(model, list, filter);
    const columns = columnsByUse(model, list.columns);
    const repeated = (keys: readonly string[]) =>
        new Set(keys.filter((key, at) => keys.indexOf(key) !== at));
    const heads = columns.map(({ dataset }) => ({
        ref: dataset.ref,
        label: model.label(dataset.ref),
        words: declarerWords(origin(dataset) ?? 'dfo'),
    }));
    const shared = repeated(heads.map((head) => head.label));
    const sharedInOrigin = repeated(heads.map((head) => `${head.label}\n${head.words}`));
    const countHeads =
        list.columns.length === 0
            ? ['stat_vars']
            : heads.map(({ ref, label, words }) => {
                  if (!shared.has(label)) return label;
                  return sharedInOrigin.has(`${label}\n${words}`)
                      ? `${label} (${words}, ${ref})`
                      : `${label} (${words})`;
              });
    const rows = GROUPS.flatMap((group) =>
        groups[group].map((row) => [
            row.id,
            model.label(row.id),
            group,
            row.valueList?.lists.join(';') ?? '',
            ...(list.columns.length === 0
                ? [row.usage.total]
                : columns.map(({ index }) => row.counts[index] ?? 0)
            ).map(String),
        ]),
    );
    return [['dcid', 'label', 'group', 'value_list', ...countHeads], ...rows];
}

/**
 * A value list's members in list order: dcid, label, classification code
 * when some member has one, the broader members of the same list, then one
 * column per open property any member carries (openColumns), headed by the
 * property's dcid. Several values in a cell are separated by semicolons.
 */
export function valueListTable(model: Model, listId: string): readonly (readonly string[])[] {
    const members = model.members(listId);
    const inList = new Set(members);
    const { fields, cell } = openColumns(model, members);
    const codes = membersHaveCodes(model, model.members(listId));
    const rows = members.map((id) => [
        id,
        model.label(id),
        ...(codes ? [model.node(id)?.classification_code[0] ?? ''] : []),
        model
            .broader(id)
            .filter((broader) => inList.has(broader))
            .join(';'),
        ...fields.map((property) => cell(id, property)),
    ]);
    return [['dcid', 'label', ...(codes ? ['code'] : []), 'broader', ...fields], ...rows];
}

/** A value list's CSV file name from its label, ending `-partial.csv` when the list is partial. */
export const valueListFileName = (model: Model, listId: string): string =>
    csvFileName(model.label(listId), { partial: !model.membersComplete(listId) });

/**
 * A dataset's patterns, group by group as patternGroups orders them, most
 * StatVars first inside each: the split combination's number and its
 * constraint properties (`split`, joined with "; " in the order the panel
 * names them), each identity field by dcid, the StatVar count and the
 * examples. Other cells with several values separate them with semicolons.
 */
export function patternTable(model: Model, datasetId: string): readonly (readonly string[])[] {
    const groups = patternGroups(model.dataset(datasetId)?.patterns ?? []);
    const rows = groups.flatMap((group, index) =>
        group.patterns.map((pattern) => [
            String(index + 1),
            group.split.join('; '),
            pattern.population_type ?? '',
            pattern.measured_property,
            pattern.stat_type ?? '',
            pattern.measurement_qualifier ?? '',
            pattern.measurement_denominator ?? '',
            String(pattern.measurement_denominator_unresolved ?? false),
            pattern.observation_properties.join(';'),
            pattern.constraint_properties.join(';'),
            String(pattern.stat_var_count),
            pattern.examples.join(';'),
        ]),
    );
    return [
        [
            'split_combination',
            'split',
            'population_type',
            'measured_property',
            'stat_type',
            'measurement_qualifier',
            'measurement_denominator',
            'measurement_denominator_unresolved',
            'observation_properties',
            'constraint_properties',
            'stat_vars',
            'examples',
        ],
        ...rows,
    ];
}

/** A dataset's patterns CSV file name from its label. */
export const patternFileName = (model: Model, datasetId: string): string =>
    csvFileName(`${model.label(datasetId)} patterns`);
