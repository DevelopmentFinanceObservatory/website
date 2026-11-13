/**
 * Explore's lists as rows for a CSV file: a scoped list as shown, and a
 * value list's members.
 */
import type { Model, ScopedList, ScopedRow } from './model.ts';
import { GROUPS } from './model.ts';

/**
 * The rows of a scoped list that `keep` passes, group by group, under a
 * header. The counts are the StatVar total, or one column per dataset the
 * list counts, headed by the dataset's label.
 */
export function scopedListTable(
    model: Model,
    list: ScopedList,
    keep: (row: ScopedRow) => boolean = () => true,
): readonly (readonly string[])[] {
    const countHeads =
        list.columns.length === 0 ? ['stat_vars'] : list.columns.map((id) => model.label(id));
    const rows = GROUPS.flatMap((group) =>
        list.groups[group]
            .filter(keep)
            .map((row) => [
                row.id,
                model.label(row.id),
                group,
                row.valueList ?? '',
                ...(list.columns.length === 0 ? [row.usage.total] : row.counts).map(String),
            ]),
    );
    return [['dcid', 'label', 'group', 'value_list', ...countHeads], ...rows];
}

/**
 * A value list's members in list order: dcid, label, classification code and
 * the broader members of the same list, separated by semicolons.
 */
export function valueListTable(model: Model, listId: string): readonly (readonly string[])[] {
    const members = model.members(listId);
    const inList = new Set(members);
    const rows = members.map((id) => [
        id,
        model.label(id),
        model.node(id)?.classification_code[0] ?? '',
        model
            .broader(id)
            .filter((broader) => inList.has(broader))
            .join(';'),
    ]);
    return [['dcid', 'label', 'code', 'broader'], ...rows];
}
