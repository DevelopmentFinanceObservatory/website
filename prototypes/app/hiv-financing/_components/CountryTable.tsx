'use client';

import { useState } from 'react';
import { flushSync } from 'react-dom';

import { hatchSwatch } from './ChartKey';
import styles from './CountryTable.module.scss';

import type { Country } from '../_data/types.ts';
import { deathCount, money, peopleShort, percent, perPerson } from '../_lib/format.ts';
import { GF_MULTI, PROVIDERS } from '../_lib/providers.ts';
import {
    DEFAULT_SORT,
    firstDirection,
    sortRows,
    tableRows,
    toCsv,
    type SortDirection,
    type SortKey,
    type TableRow,
} from '../_lib/table.ts';

const COLLAPSED_ROWS = 15;

const MISSING = '–';

type Column = { key: SortKey; label: string; cell: (row: TableRow) => string };

/** The columns for figures from `year`. */
const columns = (year: number): readonly Column[] => [
    { key: 'name', label: 'Country', cell: (row) => row.name },
    { key: 'aid', label: `HIV aid, ${year}`, cell: (row) => money(row.aid) },
    // The header names its sort: the mix column sorts on the US share.
    { key: 'mix', label: `Provider mix, ${year}, by US share`, cell: () => '' },
    {
        key: 'plhiv',
        label: `People living with HIV, ${year}`,
        cell: (row) => (row.plhiv === null ? MISSING : peopleShort(row.plhiv)),
    },
    {
        key: 'perPerson',
        label: `Aid per person living with HIV, ${year}`,
        cell: (row) => (row.perPerson === null ? MISSING : perPerson(row.perPerson)),
    },
    {
        key: 'art',
        label: `On treatment, ${year}`,
        cell: (row) => (row.art === null ? MISSING : percent(row.art)),
    },
    {
        key: 'deaths',
        label: `AIDS-related deaths, ${year}`,
        cell: (row) => (row.deaths === null ? MISSING : deathCount(row.deaths)),
    },
];

const mixLabel = (row: TableRow): string =>
    row.aid === 0
        ? 'No aid'
        : PROVIDERS.map((provider) => `${provider.label} ${row.mixPercents[provider.key]}`).join(
              ', ',
          );

/** The shares as a bar, with the US and Global Fund shares printed beside it. */
const Mix = ({ row }: { row: TableRow }) => (
    <span className={styles.mixCell}>
        <span className={styles.mix} role="img" aria-label={mixLabel(row)}>
            {PROVIDERS.map((provider) => (
                <span
                    key={provider.key}
                    style={{ flexGrow: row.shares[provider.key], background: provider.colour }}
                />
            ))}
        </span>
        <span className={styles.mixText} aria-hidden="true">
            {row.aid === 0
                ? MISSING
                : `US ${row.mixPercents.us} · GF ${row.mixPercents.globalFund}`}
        </span>
    </span>
);

/** The hatched mark on a row whose Global Fund money the row understates, with its note
 *  for screen readers. */
const FlagMark = ({ row, year }: { row: TableRow; year: number }) => (
    <>
        <span
            className={styles.flag}
            style={hatchSwatch(GF_MULTI.colour)}
            title={`Global Fund multi-disease grants of ${money(row.globalFundMulti)} in ${year}, excluded from this row`}
            aria-hidden="true"
        />
        <span className={styles.flagAmount} aria-hidden="true">
            {money(row.globalFundMulti)}
        </span>
        <span className={styles.srOnly}>
            {`, Global Fund multi-disease grants of ${money(row.globalFundMulti)} in ${year} are recorded under other CRS codes and excluded from this row`}
        </span>
    </>
);

const download = (rows: readonly TableRow[], year: number) => {
    const blob = new Blob([toCsv(rows, year)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hiv-external-financing.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
};

/**
 * Every country's last-year HIV aid, who provides it, and the UNAIDS figures beside it.
 * Header buttons sort; each Country cell holds a button that selects the row. Shows the
 * top rows of the current sort, plus the selected country wherever it ranks. The CSV holds
 * every row in the current sort order.
 */
export const CountryTable = ({
    countries,
    year,
    legend,
    selected,
    onSelect,
    onCollapse,
}: {
    countries: Country[];
    /** The year the figures are for. */
    year: number;
    /** The note under the table on the marked rows. */
    legend: string;
    selected: string | null;
    onSelect: (iso3: string) => void;
    /** Called after the table collapses to its top rows, with the rows already gone. */
    onCollapse?: () => void;
}) => {
    const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>(DEFAULT_SORT);
    const [showAll, setShowAll] = useState(false);

    const shownColumns = columns(year);
    const rows = sortRows(tableRows(countries), sort.key, sort.direction);
    const top = showAll ? rows : rows.slice(0, COLLAPSED_ROWS);
    const pinned = showAll ? undefined : rows.find((row) => row.iso3 === selected);
    const shown = pinned && !top.includes(pinned) ? [...top, pinned] : top;

    const sortBy = (key: SortKey) =>
        setSort((current) => ({
            key,
            direction:
                current.key === key
                    ? current.direction === 'ascending'
                        ? 'descending'
                        : 'ascending'
                    : firstDirection(key),
        }));

    return (
        <div className={styles.table}>
            <div
                className={styles.scroll}
                tabIndex={0}
                role="region"
                aria-label={`HIV aid by country, ${year}, scrolls sideways`}
            >
                <table>
                    <thead>
                        <tr>
                            {shownColumns.map((column) => (
                                <th
                                    key={column.key}
                                    scope="col"
                                    aria-sort={sort.key === column.key ? sort.direction : undefined}
                                >
                                    <button type="button" onClick={() => sortBy(column.key)}>
                                        {column.label}
                                        {sort.key === column.key && (
                                            <span aria-hidden="true">
                                                {sort.direction === 'ascending' ? ' ↑' : ' ↓'}
                                            </span>
                                        )}
                                    </button>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((row) => (
                            <tr key={row.iso3} data-selected={row.iso3 === selected}>
                                {shownColumns.map((column) =>
                                    column.key === 'name' ? (
                                        <th key={column.key} scope="row">
                                            <button
                                                type="button"
                                                aria-pressed={row.iso3 === selected}
                                                onClick={() => onSelect(row.iso3)}
                                            >
                                                {row.name}
                                            </button>
                                            {row.flagged && <FlagMark row={row} year={year} />}
                                        </th>
                                    ) : (
                                        <td key={column.key}>
                                            {column.key === 'mix' ? (
                                                <Mix row={row} />
                                            ) : (
                                                column.cell(row)
                                            )}
                                        </td>
                                    ),
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className={styles.legend}>
                <span
                    className={styles.flag}
                    style={hatchSwatch(GF_MULTI.colour)}
                    aria-hidden="true"
                />
                {legend}
            </p>
            <div className={styles.foot}>
                <button
                    type="button"
                    aria-expanded={showAll}
                    onClick={() => {
                        if (!showAll) {
                            setShowAll(true);

                            return;
                        }

                        // Committed first, so a scroll it triggers runs on the shorter page.
                        flushSync(() => setShowAll(false));
                        onCollapse?.();
                    }}
                >
                    {showAll ? `Show top ${COLLAPSED_ROWS}` : `Show all ${rows.length}`}
                </button>
                <button type="button" onClick={() => download(rows, year)}>
                    Download CSV
                </button>
            </div>
        </div>
    );
};
