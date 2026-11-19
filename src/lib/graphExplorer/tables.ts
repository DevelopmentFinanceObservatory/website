/**
 * Explore's lists as rows for a CSV file: a scoped list as shown, and a
 * value list's members.
 */
import { columnsByUse } from './lists.ts';
import type { Model, ScopedList } from './model.ts';
import { declarerWords, filterScopedList, GROUPS, membersHaveCodes, openColumns } from './model.ts';
import { csvFileName } from './sheet.ts';
import type { ProvenanceUsage } from './wire.ts';

/**
 * The rows of a scoped list that the filter text keeps (filterScopedList),
 * group by group, under a header. The counts are the StatVar total, or one
 * column per dataset the list counts, in the table's order (columnsByUse),
 * headed by the dataset's label. Labels two columns share carry the words
 * for each dataset's origin, read by `origin` as a node's `declared_by`
 * with null for the DFO's.
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
    const labels = columns.map(({ dataset }) => model.label(dataset.ref));
    const shared = new Set(labels.filter((label, at) => labels.indexOf(label) !== at));
    const countHeads =
        list.columns.length === 0
            ? ['stat_vars']
            : columns.map(({ dataset }, at) => {
                  const label = labels[at] ?? dataset.ref;
                  return shared.has(label)
                      ? `${label} (${declarerWords(origin(dataset) ?? 'dfo')})`
                      : label;
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
