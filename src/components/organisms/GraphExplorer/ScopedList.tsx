'use client';

import classNames from 'classnames';
import { useId, useMemo, useState } from 'react';

import { BreakableId } from './BreakableId';
import { ModelProvider, useExplore, useFullModel, useModel } from './ExploreContext';
import { OriginTag, TermLink } from './ExploreLink';
import { downloadCsv } from './downloadCsv';
import { ListToggle, useListOrigins } from './ListToggle';
import { count, memberTotal, ofMembers } from '@/lib/graphExplorer/counts';
import styles from './ScopedList.module.scss';
import ShowPills from './ShowPills';

import Button from '@/components/atoms/Button/Button';
import { START_VIEW } from '@/lib/graphExplorer/explore';
import { datasetsByUse, listHead } from '@/lib/graphExplorer/lists';
import { csvFileName } from '@/lib/graphExplorer/sheet';
import { scopedListTable } from '@/lib/graphExplorer/tables';
import {
    filterScopedList,
    GROUPS,
    type DatasetFilter,
    type Group,
    type ListScope,
    type Model,
    type ScopedRow,
} from '@/lib/graphExplorer/model';

const GROUP_TITLES: Record<Group, string> = {
    measured: 'What is measured',
    between: 'Between whom',
    split: 'How it is split',
    unused: 'Defined, not yet used by a dataset',
};

/** A dot for nothing, read aloud as "none". */
const None = () => (
    <>
        <span className={styles.none} aria-hidden="true">
            ·
        </span>
        <span className={styles.hidden}>none</span>
    </>
);

const Count = ({ n }: { n: number }) => (n === 0 ? <None /> : <>{count(n)}</>);

/** The value lists a property draws from, their size, and how many members one dataset uses. */
const ValueListCell = ({ row }: { row: ScopedRow }) => {
    if (row.valueList === null) return <None />;
    const { lists, members, complete } = row.valueList;

    return (
        <>
            {lists.map((id, at) => (
                <span key={id}>
                    {at > 0 && ', '}
                    <TermLink id={id} />
                </span>
            ))}{' '}
            <span className={styles.mono}>
                {row.values
                    ? `uses ${ofMembers(row.values)}`
                    : memberTotal(members.length, complete)}
            </span>
        </>
    );
};

type ScopedListProps = {
    scope: ListScope;
    /** The dataset filter, already checked against the full model's datasets. */
    show: DatasetFilter;
    /**
     * The model a class the DFO document does not declare lists from: its
     * node view's, over every usage document loaded. The scoped model's
     * otherwise.
     */
    classModel?: Model;
};

/**
 * The properties of one class, or every property the DFO declares,
 * grouped by what they do in a StatVar. Each row has the label, the dcid,
 * the value list it draws from and its StatVar count. The Show pills narrow
 * the count to one dataset (dimming the rows it does not use) or give each
 * dataset of the model the rows come from its own column, most StatVars
 * first, the first few on show with "All N". A class the DFO document
 * declares lists from the scoped model, so its columns follow the switches.
 * Any other class's list is that term's own view, so its rows and columns
 * cover every usage document loaded, whatever the switches say. A chosen
 * dataset the switches leave out is counted from the full model, since the
 * reader named it.
 */
const ScopedList = ({ scope, show, classModel }: ScopedListProps) => {
    const scoped = useModel();
    const full = useFullModel();
    const listed = classModel ?? scoped;
    const model = show.kind === 'dataset' && !listed.dataset(show.id) ? full : listed;
    const origins = useListOrigins(model);
    const { go, setShow } = useExplore();
    const [filter, setFilter] = useState('');
    const [columnsOpen, setColumnsOpen] = useState(false);
    const titleId = useId();
    const tableId = useId();

    const list = useMemo(() => model.scopedList(scope, show), [model, scope, show]);
    const kept = useMemo(() => filterScopedList(model, list, filter), [model, list, filter]);

    const isClass = scope.kind === 'class';
    const title = isClass
        ? `Properties of ${model.label(scope.id)}`
        : 'Properties the DFO model defines';

    // Each count column by the index of its dataset in `list.columns`, most StatVars first.
    const columnAt = new Map(list.columns.map((dataset, index) => [dataset, index]));
    const columns = listHead(
        datasetsByUse(model).flatMap((dataset) => {
            const index = columnAt.get(dataset.ref);
            return index === undefined ? [] : [{ dataset, index }];
        }),
        { open: columnsOpen },
    );
    const columnCount = 2 + Math.max(1, columns.shown.length);

    const groups = GROUPS.map((group) => ({
        group,
        rows: kept[group],
    })).filter(({ rows }) => rows.length > 0);

    return (
        <div className={styles.list}>
            <div className={styles.head}>
                <Button onClick={() => go(isClass ? { kind: 'node', id: scope.id } : START_VIEW)}>
                    {isClass ? `Back to ${model.label(scope.id)}` : 'Start'}
                </Button>
                <h1 id={titleId} className={styles.title}>
                    {title} <span className={styles.total}>({count(list.total)})</span>
                </h1>
            </div>
            <div className={styles.controls}>
                <ShowPills value={show} onChange={setShow} withAll />
                {show.kind === 'all' && (
                    <ListToggle
                        head={columns}
                        noun="columns"
                        controls={tableId}
                        open={columnsOpen}
                        onToggle={() => setColumnsOpen((open) => !open)}
                    />
                )}
                <input
                    type="search"
                    className={styles.filter}
                    placeholder="Filter this list"
                    aria-label="Filter this list by label or dcid"
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                />
                <Button
                    small
                    disabled={groups.length === 0}
                    onClick={() =>
                        downloadCsv(scopedListTable(model, list, filter), csvFileName(title))
                    }
                >
                    Download CSV
                </Button>
            </div>
            {groups.length === 0 ? (
                <p className={styles.empty} role="status">
                    No property here matches “{filter.trim()}”.
                </p>
            ) : (
                <ModelProvider value={model}>
                    <div className={styles.scroll}>
                        <table id={tableId} className={styles.table} aria-labelledby={titleId}>
                            <thead>
                                <tr>
                                    <th scope="col">Property</th>
                                    <th scope="col">Value list</th>
                                    {list.columns.length === 0 ? (
                                        <th scope="col" className={styles.num}>
                                            StatVars
                                        </th>
                                    ) : (
                                        columns.shown.map(({ dataset }) => (
                                            <th
                                                key={dataset.ref}
                                                scope="col"
                                                className={classNames(
                                                    styles.num,
                                                    list.columns.length > 1 && styles.datasetHead,
                                                )}
                                            >
                                                {model.label(dataset.ref)}
                                                <OriginTag
                                                    declaredBy={origins.dataset(dataset)}
                                                    dataset
                                                />
                                            </th>
                                        ))
                                    )}
                                </tr>
                            </thead>
                            {groups.map(({ group, rows }) => (
                                <tbody key={group}>
                                    <tr className={styles.group}>
                                        <th scope="colgroup" colSpan={columnCount}>
                                            {GROUP_TITLES[group]} ({count(rows.length)})
                                        </th>
                                    </tr>
                                    {rows.map((row) => (
                                        <tr
                                            key={row.id}
                                            className={classNames(row.dimmed && styles.dim)}
                                        >
                                            <td>
                                                <TermLink id={row.id} className={styles.name} />
                                                <span className={styles.dcid}>
                                                    <BreakableId text={row.id} />
                                                </span>
                                            </td>
                                            <td>
                                                <ValueListCell row={row} />
                                            </td>
                                            {list.columns.length === 0 ? (
                                                <td className={styles.num}>
                                                    <Count n={row.usage.total} />
                                                </td>
                                            ) : (
                                                columns.shown.map(({ dataset, index }) => (
                                                    <td key={dataset.ref} className={styles.num}>
                                                        <Count n={row.counts[index] ?? 0} />
                                                    </td>
                                                ))
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            ))}
                        </table>
                    </div>
                </ModelProvider>
            )}
        </div>
    );
};

export default ScopedList;
