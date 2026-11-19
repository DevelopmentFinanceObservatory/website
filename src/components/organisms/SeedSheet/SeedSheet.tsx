'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useId, useMemo, useRef, useState } from 'react';

import styles from './SeedSheet.module.scss';

import Button from '@/components/atoms/Button/Button';
import Spinner from '@/components/atoms/Spinner/Spinner';
import CheckSheet from '@/components/organisms/CheckSheet/CheckSheet';
import { BreakableId } from '@/components/organisms/GraphExplorer/BreakableId';
import {
    ModelProvider,
    useCarried,
    useModel,
} from '@/components/organisms/GraphExplorer/ExploreContext';
import { OriginTag, TermLink } from '@/components/organisms/GraphExplorer/ExploreLink';
import shell from '@/components/organisms/GraphExplorer/GraphExplorer.module.scss';
import {
    CeilingNote,
    ListToggle,
    TermSourcesProvider,
} from '@/components/organisms/GraphExplorer/ListToggle';
import LoadStatus from '@/components/organisms/GraphExplorer/LoadStatus';
import { PatternGroups } from '@/components/organisms/GraphExplorer/PatternGroups';
import SheetSection from '@/components/organisms/GraphExplorer/SheetSection';
import TopBar from '@/components/organisms/GraphExplorer/TopBar';
import { useExplorerData } from '@/components/organisms/GraphExplorer/useExplorerData';
import { downloadBlob } from '@/lib/download';
import { plural, valueCount } from '@/lib/graphExplorer/counts';
import type { Carried } from '@/lib/graphExplorer/explore';
import type { Model } from '@/lib/graphExplorer/model';
import {
    datasetOrigin,
    datasetsDfoFirst,
    firstMatches,
    landedUsage,
    listHead,
    termFilter,
} from '@/lib/graphExplorer/lists';
import { awaitedDataset } from '@/lib/graphExplorer/nodeView';
import {
    columnName,
    constraintBoxes,
    datasetConstraints,
    dropsOutside,
    formulaRows,
    NEW_SEED_NAME,
    readSeedQuery,
    seedColumns,
    seedCsv,
    seedQuery,
    seedRows,
    seedsYml,
    type SeedColumn,
    type SeedDataset,
    type SeedQuery,
} from '@/lib/graphExplorer/seed';

/** The rows the seed table shows before it counts the rest. */
const SHOWN_ROWS = 5;

/**
 * Replaces the page's query in place and keeps the path and the carried
 * parameters. The URL holds the chosen dataset and columns, and the back
 * button skips edits.
 */
const writeQuery = (query: SeedQuery, carried: Carried) =>
    window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${seedQuery(query, carried)}`,
    );

type CopyState = 'done' | 'blocked' | null;

const copyText = (state: CopyState): string => {
    if (state === 'done') return 'Copied.';
    return state === 'blocked' ? 'Copying is blocked here.' : '';
};

/** True when two lists hold the same entries, whatever their order. */
const sameMembers = (a: readonly string[], b: readonly string[]): boolean =>
    a.length === b.length && b.every((entry) => a.includes(entry));

/** The constraint properties some dataset's patterns name, each once, by label. */
const usedConstraints = (model: Model): readonly string[] =>
    [
        ...new Set(
            model.datasets.flatMap((dataset) =>
                dataset.patterns.flatMap((pattern) => pattern.constraint_properties),
            ),
        ),
    ].sort((a, b) => model.label(a).localeCompare(model.label(b), 'en-GB'));

/** What a reader does to reach the entries past a list's ceiling, by whether the filter is blank. */
const ceilingThen = (filter: string): string =>
    filter.trim() === '' ? 'Filter to find the rest.' : 'Type more to narrow.';

/** A filter box over a list. `placeholder` names what it matches. */
const FilterBox = ({
    value,
    placeholder,
    label,
    onChange,
}: {
    value: string;
    placeholder: string;
    label: string;
    onChange: (value: string) => void;
}) => (
    <input
        type="search"
        className={styles.filter}
        placeholder={placeholder}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
    />
);

/** One constraint column's tick box: its column name and the property it holds. */
const ConstraintBox = ({
    property,
    checked,
    onToggle,
}: {
    property: string;
    checked: boolean;
    onToggle: () => void;
}) => {
    const model = useModel();
    return (
        <label className={styles.check}>
            <input type="checkbox" checked={checked} onChange={onToggle} />
            <span className={styles.grow}>
                <span className={styles.term}>{columnName(property)}</span>{' '}
                <span className={styles.dcid}>
                    {model.label(property)}, <BreakableId text={property} />
                </span>
            </span>
        </label>
    );
};

/**
 * A constraint property's values as a cell takes them, each with its code
 * and a Copy control that copies the `dcid:` form.
 */
const ValuePanel = ({
    id,
    property,
    onClose,
}: {
    id: string;
    property: string;
    onClose: () => void;
}) => {
    const model = useModel();
    const [copied, setCopied] = useState<{ value: string; state: CopyState } | null>(null);
    const [filter, setFilter] = useState('');
    const values = model.valueListOfProperty(property);
    if (values === undefined) return null;

    const byTerm = termFilter(model, filter);
    const needle = filter.trim().toLowerCase();
    const shown = firstMatches(
        values.members,
        byTerm === null
            ? null
            : (value) =>
                  byTerm(value) ||
                  (model.node(value)?.classification_code ?? []).some((code) =>
                      code.toLowerCase().includes(needle),
                  ),
    );

    const copy = (value: string) => {
        navigator.clipboard.writeText(`dcid:${value}`).then(
            () => setCopied({ value, state: 'done' }),
            () => setCopied({ value, state: 'blocked' }),
        );
    };
    // One status line for the panel, naming the value so each copy reads differently.
    const status =
        copied?.state === 'done' ? `Copied dcid:${copied.value}.` : copyText(copied?.state ?? null);

    return (
        <section id={id} className={styles.panel} aria-label={`Values of ${columnName(property)}`}>
            <div className={styles.panelHead}>
                <p>
                    <span className={styles.term}>
                        <TermLink id={property} />
                    </span>{' '}
                    <span className={styles.dcid}>
                        {valueCount(values.members.length, values.complete)}
                    </span>
                </p>
                <Button variant="bordered" small onClick={onClose}>
                    Close
                </Button>
            </div>
            <p className={styles.note}>
                Copy a value as it goes in the cell. <span role="status">{status}</span>
            </p>
            <FilterBox
                value={filter}
                placeholder="Filter by code, name or dcid"
                label={`Filter the values of ${columnName(property)} by code, name or dcid`}
                onChange={setFilter}
            />
            <div className={styles.values}>
                <table className={styles.sheet}>
                    <caption className={styles.hidden}>
                        The values of {columnName(property)}, with their codes
                    </caption>
                    <thead>
                        <tr>
                            <th scope="col">Code</th>
                            <th scope="col">Name</th>
                            <th scope="col">Cell</th>
                        </tr>
                    </thead>
                    <tbody>
                        {shown.hits.map((value) => (
                            <tr key={value}>
                                <td>{model.node(value)?.classification_code.join(', ')}</td>
                                <td className={styles.name}>{model.label(value)}</td>
                                <td>
                                    <span className={styles.cellValue}>
                                        <BreakableId text={`dcid:${value}`} />
                                        <Button small onClick={() => copy(value)}>
                                            Copy
                                        </Button>
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {shown.total === 0 && values.members.length > 0 && (
                <p className={styles.note} role="status">
                    No value matches “{filter.trim()}”.
                </p>
            )}
            <CeilingNote matches={shown} then={ceilingThen(filter)} />
        </section>
    );
};

type SeedTableProps = {
    columns: readonly SeedColumn[];
    rows: readonly (readonly string[])[];
    /** The constraint property whose values are open. */
    open: string | null;
    panelId: string;
    onOpen: (property: string | null) => void;
};

/** The seed's header and first rows. A constraint heading with a value list opens its values. */
const SeedTable = ({ columns, rows, open, panelId, onOpen }: SeedTableProps) => {
    const model = useModel();
    const captionId = useId();
    const shown = rows.slice(0, SHOWN_ROWS);
    const cellClass = (column: SeedColumn | undefined, cell: string): string | undefined => {
        if (column === undefined || column.kind === 'reference') return undefined;
        return cell === '' ? styles.empty : styles.fill;
    };

    return (
        <div
            className={styles.scroll}
            role="region"
            aria-labelledby={captionId}
            // The box scrolls sideways, and a tab stop lets a keyboard scroll it.
            tabIndex={0}
        >
            <table className={styles.sheet}>
                <caption id={captionId} className={styles.hidden}>
                    The seed&rsquo;s columns and its first rows
                </caption>
                <thead>
                    <tr>
                        {columns.map(({ name, property }) => {
                            if (property === null) {
                                return (
                                    <th key={name} scope="col">
                                        {name}
                                    </th>
                                );
                            }
                            const listed = model.valueListOfProperty(property) !== undefined;
                            const expanded = open === property;
                            return (
                                <th key={name} scope="col">
                                    {listed ? (
                                        <Button
                                            variant="inline"
                                            className={styles.headingToggle}
                                            aria-expanded={expanded}
                                            aria-controls={expanded ? panelId : undefined}
                                            onClick={() => onOpen(expanded ? null : property)}
                                        >
                                            {name}
                                        </Button>
                                    ) : (
                                        name
                                    )}
                                    <span className={styles.headingId}>{property}</span>
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody>
                    {shown.length === 0 ? (
                        <tr>
                            <td colSpan={columns.length}>Paste codes to fill the rows.</td>
                        </tr>
                    ) : (
                        shown.map((row, at) => (
                            // Rows follow the pasted lines, which carry no identity of their own.
                            <tr key={at}>
                                {row.map((cell, index) => (
                                    <td
                                        key={columns[index]?.name ?? index}
                                        className={cellClass(columns[index], cell)}
                                    >
                                        {cell}
                                    </td>
                                ))}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
};

/**
 * Steps 1 to 4 over the model and the URL's choices. The picker lists the
 * scoped model's datasets. A dataset the URL names is read from the full
 * model, so a link from an outside dataset's view seeds that dataset
 * whatever the switches say. While an outside usage document that may hold
 * it loads, the steps wait. A named dataset with no patterns, once every
 * document has settled, gives way to the first dataset, with a line saying so.
 */
const SeedSteps = ({ openAt }: { openAt: 'start' | 'check' }) => {
    const model = useModel();
    const data = useExplorerData();
    const full = data.full ?? model;
    const params = useSearchParams();
    const carried = useCarried();
    const codesId = useId();
    const panelId = useId();
    const scrolled = useRef(false);
    const [codes, setCodes] = useState('');
    const [open, setOpen] = useState<string | null>(null);
    const [picksOpen, setPicksOpen] = useState(false);
    const [boxesOpen, setBoxesOpen] = useState(false);
    const [moreFilter, setMoreFilter] = useState('');
    const picksId = useId();
    const boxesId = useId();
    // What the last copy did, and the stub it copied, so a changed stub shows no stale note.
    const [copied, setCopied] = useState<{ state: CopyState; yml: string } | null>(null);

    const query = useMemo(() => readSeedQuery(params), [params]);
    const outside = useMemo(() => landedUsage(data.usage), [data.usage]);
    const datasets = useMemo(
        () => datasetsDfoFirst(model, outside).filter((dataset) => dataset.patterns.length > 0),
        [model, outside],
    );
    const named = query.dataset === null ? undefined : full.dataset(query.dataset);
    const awaited =
        query.dataset === null ? null : awaitedDataset(full, [query.dataset], data.usage);
    const usage =
        named !== undefined && named.patterns.length > 0
            ? named
            : awaited === null
              ? datasets[0]
              : undefined;
    const picks = usage === undefined || datasets.includes(usage) ? datasets : [...datasets, usage];
    const outsideDataset = usage !== undefined && datasetOrigin(usage, outside) !== null;
    const dataset = useMemo(
        (): SeedDataset | null =>
            usage === undefined
                ? null
                : {
                      id: usage.ref,
                      label: full.label(usage.ref),
                      stat_var_count: usage.stat_var_count,
                      patterns: usage.patterns,
                      constraint_values: usage.constraint_values,
                  },
        [full, usage],
    );
    const used = useMemo(() => usedConstraints(model), [model]);
    // An added id makes a column only when some dataset uses it, so the page lists a tick box for it.
    const choice = useMemo(
        () => ({
            dropped: query.dropped,
            added: query.added.filter((id) => used.includes(id)),
        }),
        [used, query],
    );
    const columns = useMemo(
        () => (dataset === null ? [] : seedColumns(dataset, choice)),
        [dataset, choice],
    );
    const { rows, merged } = useMemo(() => seedRows(columns, codes), [columns, codes]);
    const own = useMemo(() => (dataset === null ? [] : datasetConstraints(dataset)), [dataset]);
    const others = used.filter((property) => !own.includes(property));
    // The "more constraints" box opens when the URL adds one of them, then follows the reader.
    const [moreOpen, setMoreOpen] = useState(() =>
        others.some((property) => choice.added.includes(property)),
    );

    // The page scrolls to the check step once, on the step's first mount, which may wait for an
    // awaited dataset.
    const scrollToCheck = useCallback(
        (element: HTMLDivElement | null) => {
            if (element === null || openAt !== 'check' || scrolled.current) return;
            scrolled.current = true;
            element.scrollIntoView({ block: 'start' });
        },
        [openAt],
    );

    const checkSection = (title: string) => (
        <div ref={scrollToCheck} className={styles.step}>
            <CheckSheet title={title} outsideDataset={outsideDataset} />
        </div>
    );

    if (awaited !== null) {
        return (
            <p className={styles.lead} role="status">
                <Spinner size={16} label="Loading" />{' '}
                <span>
                    Loading{' '}
                    <code>
                        <BreakableId text={awaited} />
                    </code>{' '}
                    from the graph.
                </span>
            </p>
        );
    }

    if (dataset === null) {
        return (
            <>
                <p className={styles.lead} role="status">
                    No dataset on the graph has patterns, so there is nothing to start from.
                </p>
                {checkSection('Check a seed')}
            </>
        );
    }

    const dropped = new Set(choice.dropped);
    const added = new Set(choice.added);
    const write = (next: Partial<SeedQuery>) =>
        writeQuery({ dataset: dataset.id, ...choice, ...next }, carried);
    const toggle = (list: 'dropped' | 'added', property: string) =>
        write({
            [list]: choice[list].includes(property)
                ? choice[list].filter((id) => id !== property)
                : [...choice[list], property],
        });
    const chooseColumns = (split: readonly string[]) => {
        setOpen(null);
        write({ dropped: dropsOutside(dataset, split) });
    };
    const pickHead = listHead(picks, {
        open: picksOpen,
        keep: (each) => each.ref === dataset.id,
    });
    const boxes = constraintBoxes(dataset, { dropped: choice.dropped, open: boxesOpen });
    const moreShown = firstMatches(others, termFilter(model, moreFilter));
    const shownOpen = columns.some((column) => column.property !== null && column.property === open)
        ? open
        : null;
    const prefilled = columns.some((column) => column.fill !== '');
    const formulas = formulaRows(rows).length;
    const yml = seedsYml(NEW_SEED_NAME, columns);

    const copyYml = () => {
        navigator.clipboard.writeText(yml).then(
            () => setCopied({ state: 'done', yml }),
            () => setCopied({ state: 'blocked', yml }),
        );
    };
    const download = () =>
        downloadBlob(
            new Blob([`${seedCsv(columns, rows)}\r\n`], { type: 'text/csv;charset=utf-8' }),
            `${NEW_SEED_NAME}.csv`,
        );

    return (
        <>
            {query.dataset !== null && query.dataset !== dataset.id && (
                <p className={styles.note} role="status">
                    No dataset{' '}
                    <code>
                        <BreakableId text={query.dataset} />
                    </code>{' '}
                    has patterns on the graph, so the page starts from {dataset.label}.
                </p>
            )}
            <SheetSection title="1. Which existing dataset is closest?">
                <div id={picksId} className={styles.pick} role="group" aria-label="Dataset">
                    {pickHead.shown.map((each) => (
                        <Button
                            key={each.ref}
                            variant="card"
                            className={styles.choice}
                            aria-pressed={each.ref === dataset.id}
                            onClick={() => {
                                setOpen(null);
                                writeQuery({ dataset: each.ref, dropped: [], added: [] }, carried);
                            }}
                        >
                            <span className={styles.choiceName}>
                                {full.label(each.ref)}
                                <OriginTag declaredBy={datasetOrigin(each, outside)} dataset />
                            </span>
                            <span className={styles.choiceMeta}>
                                {plural(each.stat_var_count, 'StatVar')},{' '}
                                {plural(each.patterns.length, 'pattern')}
                            </span>
                        </Button>
                    ))}
                </div>
                <ListToggle
                    head={pickHead}
                    noun="datasets"
                    controls={picksId}
                    open={picksOpen}
                    onToggle={() => setPicksOpen((was) => !was)}
                />
                {/* The full model holds a dataset the URL names from outside the switches' scope. */}
                <ModelProvider value={full}>
                    <PatternGroups
                        datasetId={dataset.id}
                        action={(group, groups) =>
                            groups.length > 1 && (
                                <Button
                                    variant="bordered"
                                    small
                                    aria-pressed={sameMembers(
                                        choice.dropped,
                                        dropsOutside(dataset, group.split),
                                    )}
                                    onClick={() => chooseColumns(group.split)}
                                >
                                    Use These Columns
                                </Button>
                            )
                        }
                    />
                </ModelProvider>
            </SheetSection>

            <SheetSection title="2. Paste the source’s codes">
                <label htmlFor={codesId} className={styles.note}>
                    One code per line. A tab and a label after the code fill{' '}
                    <code>statvar_name</code>.
                </label>
                <textarea
                    id={codesId}
                    className={styles.paste}
                    value={codes}
                    onChange={(event) => setCodes(event.target.value)}
                    rows={6}
                    spellCheck={false}
                    autoComplete="off"
                    wrap="off"
                />
            </SheetSection>

            <SheetSection title="3. Your seed">
                <fieldset className={styles.constraints}>
                    <legend className={styles.note}>
                        Constraint columns. Each ticked constraint becomes a column, named from the
                        property beside it.
                    </legend>
                    <div id={boxesId} className={styles.checks}>
                        {boxes.shown.map((property) => (
                            <ConstraintBox
                                key={property}
                                property={property}
                                checked={!dropped.has(property)}
                                onToggle={() => toggle('dropped', property)}
                            />
                        ))}
                    </div>
                    <ListToggle
                        head={boxes}
                        noun="constraints"
                        controls={boxesId}
                        open={boxesOpen}
                        onToggle={() => setBoxesOpen((was) => !was)}
                    />
                    {others.length > 0 && (
                        <details
                            className={styles.more}
                            open={moreOpen}
                            onToggle={(event) => setMoreOpen(event.currentTarget.open)}
                        >
                            <summary>
                                {plural(others.length, 'more constraint')} other datasets use
                            </summary>
                            <FilterBox
                                value={moreFilter}
                                placeholder="Filter by name or dcid"
                                label="Filter the other datasets' constraints by name or dcid"
                                onChange={setMoreFilter}
                            />
                            <div className={styles.checks}>
                                {moreShown.hits.map((property) => (
                                    <ConstraintBox
                                        key={property}
                                        property={property}
                                        checked={added.has(property)}
                                        onToggle={() => toggle('added', property)}
                                    />
                                ))}
                            </div>
                            {moreShown.total === 0 && (
                                <p className={styles.note} role="status">
                                    No constraint matches “{moreFilter.trim()}”.
                                </p>
                            )}
                            <CeilingNote matches={moreShown} then={ceilingThen(moreFilter)} />
                        </details>
                    )}
                </fieldset>
                <SeedTable
                    columns={columns}
                    rows={rows}
                    open={shownOpen}
                    panelId={panelId}
                    onOpen={setOpen}
                />
                <p className={styles.note}>
                    {plural(rows.length, 'row')}
                    {rows.length > SHOWN_ROWS && `, first ${SHOWN_ROWS} shown`}.{' '}
                    {merged > 0 &&
                        `Merged ${plural(merged, 'line')} that repeated an earlier code. `}
                    {prefilled &&
                        `Grey cells are filled because every StatVar of ${dataset.label} uses that value. `}
                    Hatched cells are yours to fill. An empty constraint cell means the StatVar has
                    no such constraint. A row that reuses a StatVar defined elsewhere leaves{' '}
                    <code>population_type</code>, <code>measured_property</code> and{' '}
                    <code>stat_type</code> empty, so clear any grey cell there. Open a constraint
                    heading to see its values.
                </p>
                {formulas > 0 && (
                    <p className={styles.warning}>
                        {plural(formulas, 'row')} {formulas === 1 ? 'starts its' : 'start their'}{' '}
                        code or label with <code>=</code>, <code>+</code>, <code>-</code> or{' '}
                        <code>@</code>. The CSV keeps the cell as written, which a spreadsheet
                        opening it may run as a formula.
                    </p>
                )}
                {shownOpen !== null && (
                    <ValuePanel id={panelId} property={shownOpen} onClose={() => setOpen(null)} />
                )}
                <div className={styles.exports}>
                    <Button variant="dark" onClick={download}>
                        Download Seed CSV
                    </Button>
                    <Button variant="bordered" onClick={copyYml}>
                        Copy seeds.yml
                    </Button>
                    <span className={styles.status} role="status">
                        {copied?.yml === yml ? copyText(copied.state) : ''}
                    </span>
                </div>
                <p className={styles.note}>
                    Left to you: the seed&rsquo;s name (the file downloads as{' '}
                    <code>{NEW_SEED_NAME}.csv</code>), a value in each empty constraint cell, the{' '}
                    <code>unit</code> and <code>measurement_method</code> of each row, and the SQL
                    that reads the seed.
                </p>
            </SheetSection>

            {checkSection('4. Check it')}
        </>
    );
};

/**
 * Seed a dataset: a seed for a new dataset's pipeline, copied from the
 * closest existing dataset, filled with the source's codes and checked
 * against the graph. The chosen dataset and columns live in the URL query.
 * Check a sheet is this page opened at its check step. The model is the one
 * the section's layout loaded.
 */
const SeedSheet = ({ openAt = 'start' }: { openAt?: 'start' | 'check' }) => {
    // Check a sheet opens at the check step and carries its own name, as TopBar marks it.
    const title = openAt === 'check' ? 'Check a sheet' : 'Seed a dataset';
    const data = useExplorerData();
    const model = data.model.status === 'ready' ? data.model.value : null;

    return (
        <ModelProvider value={model}>
            <TermSourcesProvider>
                <div className={shell.explorer}>
                    <TopBar />
                    <main className={shell.main}>
                        <div className={styles.page}>
                            <header className={styles.header}>
                                <p className={styles.label}>Pipeline seeds</p>
                                <h1 className={styles.title}>{title}</h1>
                                <p className={styles.lead}>
                                    Start a new dataset&rsquo;s seed from the closest existing
                                    dataset and the source&rsquo;s codes, then check the filled seed
                                    against the graph. The download is the file a pipeline commits
                                    under <code>dbt/seeds/</code>.
                                </p>
                            </header>
                            {data.model.status === 'ready' ? (
                                <SeedSteps openAt={openAt} />
                            ) : (
                                <LoadStatus state={data.model} onRetry={data.retryModel} />
                            )}
                        </div>
                    </main>
                </div>
            </TermSourcesProvider>
        </ModelProvider>
    );
};

export default SeedSheet;
