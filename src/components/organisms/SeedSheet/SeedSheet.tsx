'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import styles from './SeedSheet.module.scss';

import Button from '@/components/atoms/Button/Button';
import CheckSheet from '@/components/organisms/CheckSheet/CheckSheet';
import { BreakableId } from '@/components/organisms/GraphExplorer/BreakableId';
import {
    ModelProvider,
    useCarried,
    useModel,
} from '@/components/organisms/GraphExplorer/ExploreContext';
import { TermLink } from '@/components/organisms/GraphExplorer/ExploreLink';
import shell from '@/components/organisms/GraphExplorer/GraphExplorer.module.scss';
import LoadStatus from '@/components/organisms/GraphExplorer/LoadStatus';
import SheetSection from '@/components/organisms/GraphExplorer/SheetSection';
import TopBar from '@/components/organisms/GraphExplorer/TopBar';
import { useExplorerData } from '@/components/organisms/GraphExplorer/useExplorerData';
import { downloadBlob } from '@/lib/download';
import { plural, valueCount } from '@/lib/graphExplorer/counts';
import type { Carried } from '@/lib/graphExplorer/explore';
import { patternId, type Model } from '@/lib/graphExplorer/model';
import {
    columnName,
    datasetConstraints,
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

/** The constraint properties some dataset's patterns name, each once, by label. */
const usedConstraints = (model: Model): readonly string[] =>
    [
        ...new Set(
            model.datasets.flatMap((dataset) =>
                dataset.patterns.flatMap((pattern) => pattern.constraint_properties),
            ),
        ),
    ].sort((a, b) => model.label(a).localeCompare(model.label(b), 'en-GB'));

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
    const values = model.valueListOfProperty(property);
    if (values === undefined) return null;

    const copy = (value: string) => {
        navigator.clipboard.writeText(`dcid:${value}`).then(
            () => setCopied({ value, state: 'done' }),
            () => setCopied({ value, state: 'blocked' }),
        );
    };

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
            <p className={styles.note}>Copy a value as it goes in the cell.</p>
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
                        {values.members.map((value) => (
                            <tr key={value}>
                                <td>{model.node(value)?.classification_code.join(', ')}</td>
                                <td className={styles.name}>{model.label(value)}</td>
                                <td>
                                    <span className={styles.cellValue}>
                                        <BreakableId text={`dcid:${value}`} />
                                        <Button small onClick={() => copy(value)}>
                                            Copy
                                        </Button>
                                        <span role="status" className={styles.status}>
                                            {copied?.value === value ? copyText(copied.state) : ''}
                                        </span>
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
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
                                        <button
                                            type="button"
                                            className={styles.heading}
                                            aria-expanded={expanded}
                                            aria-controls={expanded ? panelId : undefined}
                                            onClick={() => onOpen(expanded ? null : property)}
                                        >
                                            {name}
                                        </button>
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

/** Steps 1 to 4 over the model and the URL's choices. */
const SeedSteps = ({ openAt }: { openAt: 'start' | 'check' }) => {
    const model = useModel();
    const params = useSearchParams();
    const carried = useCarried();
    const codesId = useId();
    const panelId = useId();
    const checkStep = useRef<HTMLDivElement | null>(null);
    const [codes, setCodes] = useState('');
    const [open, setOpen] = useState<string | null>(null);
    const [copied, setCopied] = useState<CopyState>(null);

    const query = useMemo(() => readSeedQuery(params), [params]);
    const datasets = useMemo(
        () => model.datasets.filter((dataset) => dataset.patterns.length > 0),
        [model],
    );
    const usage = datasets.find((dataset) => dataset.ref === query.dataset) ?? datasets[0];
    const dataset = useMemo(
        (): SeedDataset | null =>
            usage === undefined
                ? null
                : {
                      id: usage.ref,
                      label: model.label(usage.ref),
                      patterns: usage.patterns,
                      constraint_values: usage.constraint_values,
                  },
        [model, usage],
    );
    // An added id the model holds no property for makes no column.
    const choice = useMemo(
        () => ({
            dropped: query.dropped,
            added: query.added.filter((id) => model.kind(id) === 'property'),
        }),
        [model, query],
    );
    const columns = useMemo(
        () => (dataset === null ? [] : seedColumns(dataset, choice)),
        [dataset, choice],
    );
    const { rows, merged } = useMemo(() => seedRows(columns, codes), [columns, codes]);

    useEffect(() => {
        if (openAt === 'check') checkStep.current?.scrollIntoView({ block: 'start' });
    }, [openAt]);

    const checkSection = (title: string) => (
        <div ref={checkStep} className={styles.step}>
            <CheckSheet title={title} />
        </div>
    );

    if (dataset === null) {
        return (
            <>
                <p className={styles.lead} role="status">
                    No dataset on the graph has patterns yet, so there is nothing to start from.
                </p>
                {checkSection('Check a seed')}
            </>
        );
    }

    const own = datasetConstraints(dataset);
    const dropped = new Set(choice.dropped);
    const added = new Set(choice.added);
    const others = usedConstraints(model).filter((property) => !own.includes(property));
    const write = (next: Partial<SeedQuery>) =>
        writeQuery({ dataset: dataset.id, ...choice, ...next }, carried);
    const toggle = (list: 'dropped' | 'added', property: string) =>
        write({
            [list]: choice[list].includes(property)
                ? choice[list].filter((id) => id !== property)
                : [...choice[list], property],
        });
    const shownOpen = columns.some((column) => column.property !== null && column.property === open)
        ? open
        : null;
    const prefilled = columns.some((column) => column.fill !== '');

    const copyYml = () => {
        navigator.clipboard.writeText(seedsYml(NEW_SEED_NAME, columns)).then(
            () => setCopied('done'),
            () => setCopied('blocked'),
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
                <div className={styles.pick} role="group" aria-label="Dataset">
                    {datasets.map((each) => (
                        <button
                            key={each.ref}
                            type="button"
                            className={styles.choice}
                            aria-pressed={each.ref === dataset.id}
                            onClick={() => {
                                setOpen(null);
                                writeQuery({ dataset: each.ref, dropped: [], added: [] }, carried);
                            }}
                        >
                            <span className={styles.choiceName}>{model.label(each.ref)}</span>
                            <span className={styles.choiceMeta}>
                                {plural(each.stat_var_count, 'StatVar')},{' '}
                                {plural(each.patterns.length, 'pattern')}
                            </span>
                        </button>
                    ))}
                </div>
                <ul className={styles.patterns}>
                    {dataset.patterns.map((pattern) => (
                        <li key={patternId(pattern)}>
                            Population type <code>{pattern.population_type ?? 'none'}</code>,
                            measured property <code>{pattern.measured_property}</code>
                            {pattern.constraint_properties.length > 0 && ', constraints '}
                            {pattern.constraint_properties.map((property, at) => (
                                <span key={property}>
                                    {at > 0 && ', '}
                                    <code>
                                        <BreakableId text={property} />
                                    </code>
                                </span>
                            ))}
                            : {plural(pattern.stat_var_count, 'StatVar')}
                        </li>
                    ))}
                </ul>
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
                    <div className={styles.checks}>
                        {own.map((property) => (
                            <ConstraintBox
                                key={property}
                                property={property}
                                checked={!dropped.has(property)}
                                onToggle={() => toggle('dropped', property)}
                            />
                        ))}
                    </div>
                    {others.length > 0 && (
                        <details
                            className={styles.more}
                            open={others.some((property) => added.has(property)) || undefined}
                        >
                            <summary>
                                {plural(others.length, 'more constraint')} other datasets use
                            </summary>
                            <div className={styles.checks}>
                                {others.map((property) => (
                                    <ConstraintBox
                                        key={property}
                                        property={property}
                                        checked={added.has(property)}
                                        onToggle={() => toggle('added', property)}
                                    />
                                ))}
                            </div>
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
                    no such constraint. Open a constraint heading to see its values.
                </p>
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
                        {copyText(copied)}
                    </span>
                </div>
                <p className={styles.note}>
                    Left to you: the seed&rsquo;s name (the file downloads as{' '}
                    <code>{NEW_SEED_NAME}.csv</code>), the value for each code in the empty cells,
                    the key name if it is not <code>source_code</code>, <code>unit</code>,{' '}
                    <code>measurement_method</code>, and the SQL that reads the seed.
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
    const data = useExplorerData();
    const model = data.model.status === 'ready' ? data.model.value : null;

    return (
        <ModelProvider value={model}>
            <div className={shell.explorer}>
                <TopBar />
                <main className={shell.main}>
                    <div className={styles.page}>
                        <header className={styles.header}>
                            <p className={styles.label}>Pipeline seeds</p>
                            <h1 className={styles.title}>Seed a dataset</h1>
                            <p className={styles.lead}>
                                Start a new dataset&rsquo;s seed from the closest existing dataset
                                and the source&rsquo;s codes, then check the filled seed against the
                                graph. The download is the file a pipeline commits under{' '}
                                <code>dbt/seeds/</code>.
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
        </ModelProvider>
    );
};

export default SeedSheet;
