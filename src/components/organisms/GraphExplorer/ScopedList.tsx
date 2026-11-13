'use client';

import classNames from 'classnames';
import { useId, useMemo, useState } from 'react';

import { useExplore, useModel } from './ExploreContext';
import { TermLink } from './ExploreLink';
import { downloadCsv } from './downloadCsv';
import { count } from './format';
import styles from './ScopedList.module.scss';
import ShowPills from './ShowPills';

import Button from '@/components/atoms/Button/Button';
import { START_VIEW } from '@/lib/graphExplorer/explore';
import { csvFileName } from '@/lib/graphExplorer/sheet';
import { scopedListTable } from '@/lib/graphExplorer/tables';
import {
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

/** Whether a row's label or dcid holds the filter text, lower-cased. */
const matches = (model: Model, row: ScopedRow, needle: string): boolean =>
    needle === '' ||
    model.label(row.id).toLowerCase().includes(needle) ||
    row.id.toLowerCase().includes(needle);

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

/** The value list a property draws from, its size, and how many members one dataset uses. */
const ValueListCell = ({ row }: { row: ScopedRow }) => {
    const model = useModel();
    if (row.valueList === null) return <None />;
    const size = model.members(row.valueList).length;

    return (
        <>
            <TermLink id={row.valueList} />{' '}
            <span className={styles.mono}>
                {row.values
                    ? `uses ${count(row.values.used)} of ${count(row.values.of)}`
                    : count(size)}
            </span>
        </>
    );
};

type ScopedListProps = {
    scope: ListScope;
    /** The dataset filter, already checked against the model's datasets. */
    show: DatasetFilter;
};

/**
 * The properties of one class, or every property the instance declares,
 * grouped by what they do in a StatVar. Each row has the label, the dcid,
 * the value list it draws from and its StatVar count; the Show pills narrow
 * the count to one dataset (dimming the rows it does not use) or give each
 * dataset its own column.
 */
const ScopedList = ({ scope, show }: ScopedListProps) => {
    const model = useModel();
    const { go, setShow } = useExplore();
    const [filter, setFilter] = useState('');
    const titleId = useId();

    const list = useMemo(() => model.scopedList(scope, show), [model, scope, show]);
    const needle = filter.trim().toLowerCase();

    const isClass = scope.kind === 'class';
    const title = isClass
        ? `Properties of ${model.label(scope.id)}`
        : 'Properties the DFO model defines';

    const countHeads =
        list.columns.length === 0
            ? ['StatVars']
            : list.columns.map((dataset) => model.label(dataset));
    const columnCount = 2 + countHeads.length;

    const groups = GROUPS.map((group) => ({
        group,
        rows: list.groups[group].filter((row) => matches(model, row, needle)),
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
                        downloadCsv(
                            scopedListTable(model, list, (row) => matches(model, row, needle)),
                            csvFileName(title),
                        )
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
                <div className={styles.scroll}>
                    <table className={styles.table} aria-labelledby={titleId}>
                        <thead>
                            <tr>
                                <th scope="col">Property</th>
                                <th scope="col">Value list</th>
                                {countHeads.map((head, index) => (
                                    <th
                                        key={list.columns[index] ?? head}
                                        scope="col"
                                        className={classNames(
                                            styles.num,
                                            list.columns.length > 1 && styles.datasetHead,
                                        )}
                                    >
                                        {head}
                                    </th>
                                ))}
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
                                        className={classNames(
                                            show.kind === 'dataset' &&
                                                row.counts[0] === 0 &&
                                                styles.dim,
                                        )}
                                    >
                                        <td>
                                            <TermLink id={row.id} className={styles.name} />
                                            <span className={styles.dcid}>{row.id}</span>
                                        </td>
                                        <td>
                                            <ValueListCell row={row} />
                                        </td>
                                        {list.columns.length === 0 ? (
                                            <td className={styles.num}>
                                                <Count n={row.usage.total} />
                                            </td>
                                        ) : (
                                            row.counts.map((n, index) => (
                                                <td
                                                    key={list.columns[index]}
                                                    className={styles.num}
                                                >
                                                    <Count n={n} />
                                                </td>
                                            ))
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        ))}
                    </table>
                </div>
            )}
        </div>
    );
};

export default ScopedList;
