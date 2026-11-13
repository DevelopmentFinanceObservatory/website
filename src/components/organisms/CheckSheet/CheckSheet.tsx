'use client';

import classNames from 'classnames';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import styles from './CheckSheet.module.scss';

import Button from '@/components/atoms/Button/Button';
import { downloadCsv } from '@/components/organisms/GraphExplorer/downloadCsv';
import { ModelProvider, useModel } from '@/components/organisms/GraphExplorer/ExploreContext';
import { TermLink } from '@/components/organisms/GraphExplorer/ExploreLink';
import { plural } from '@/components/organisms/GraphExplorer/format';
import shell from '@/components/organisms/GraphExplorer/GraphExplorer.module.scss';
import LoadStatus from '@/components/organisms/GraphExplorer/LoadStatus';
import TopBar from '@/components/organisms/GraphExplorer/TopBar';
import { useExplorerData } from '@/components/organisms/GraphExplorer/useExplorerData';
import {
    CheckError,
    checkRows,
    closestMembers,
    exampleSheet,
    findingMessage,
    findingsCsvRows,
    resultSentence,
    type CheckResult,
    type MessagePart,
} from '@/lib/graphExplorer/check';
import {
    locateFinding,
    mapHeaders,
    parsePasted,
    rowsToCheck,
    switchColumn,
    type ColumnTarget,
    type Mapping,
    type PastedRange,
} from '@/lib/graphExplorer/pasted';
import type { OntologyFinding } from '@/lib/graphExplorer/wire';

type Switch = 'property' | 'ignored';

/** The rows and columns a check ran on, kept with its result. */
type Checked = {
    readonly result: CheckResult;
    readonly mapping: Mapping;
    readonly pasted: PastedRange;
    readonly rows: number;
};

type Run =
    | { readonly status: 'idle' }
    | {
          readonly status: 'running';
          readonly checked: number;
          readonly total: number;
          readonly retryInMs: number | null;
      }
    | { readonly status: 'done'; readonly checked: Checked }
    | { readonly status: 'failed'; readonly message: string };

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => {
    const id = useId();
    return (
        <section className={styles.section} aria-labelledby={id}>
            <h2 id={id} className={styles.heading}>
                {title}
            </h2>
            {children}
        </section>
    );
};

const readAs = (target: ColumnTarget): string => {
    if (target.kind === 'definition') return `Definition field (${target.field})`;
    return target.kind === 'property' ? 'Property' : 'Ignored';
};

type ColumnRowProps = {
    header: string;
    read: ColumnTarget;
    target: ColumnTarget;
    onSwitch: (to: Switch | null) => void;
};

/** One pasted column: how the page read it and a switch between property and ignored. */
const ColumnRow = ({ header, read, target, onSwitch }: ColumnRowProps) => {
    const model = useModel();
    const selectId = useId();
    const options: { value: string; label: string }[] = [
        ...(read.kind === 'definition' ? [{ value: 'read', label: readAs(read) }] : []),
        { value: 'property', label: 'Property' },
        { value: 'ignored', label: 'Ignored' },
    ];
    const selected = target.kind === 'definition' ? 'read' : target.kind;
    const held = target.kind === 'property' && model.kind(target.property) === 'property';

    return (
        <li className={styles.column}>
            <label htmlFor={selectId} className={styles.columnName}>
                {header || '(no header)'}
            </label>
            <select
                id={selectId}
                className={styles.select}
                value={selected}
                onChange={(event) => {
                    const value = event.target.value;
                    onSwitch(value === 'read' || value === read.kind ? null : (value as Switch));
                }}
            >
                {options.map((option) => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
            {target.kind === 'property' && (
                <span className={styles.columnNote}>
                    {held ? (
                        <TermLink id={target.property} />
                    ) : (
                        <>
                            <code>{target.property}</code> is no property in the model; the check
                            asks the graph
                        </>
                    )}
                </span>
            )}
        </li>
    );
};

const Message = ({ parts }: { parts: readonly MessagePart[] }) => (
    <>
        {parts.map((part, at) => {
            // The parts are a fixed sequence built once per finding.
            if (part.kind === 'term') return <TermLink key={at} id={part.id} />;
            if (part.kind === 'value') {
                return (
                    <code key={at} className={styles.value}>
                        {part.text}
                    </code>
                );
            }
            return <span key={at}>{part.text}</span>;
        })}
    </>
);

const Suggestions = ({ finding }: { finding: OntologyFinding }) => {
    const model = useModel();
    const closest = closestMembers(model, finding);
    if (closest.length === 0) return null;
    return (
        <span className={styles.note}>
            Closest values:{' '}
            {closest.map((id, at) => (
                <span key={id}>
                    {at > 0 && ', '}
                    <TermLink id={id} /> <code className={styles.dcid}>{id}</code>
                </span>
            ))}
        </span>
    );
};

const cellKey = (row: number, column: number) => `${row}:${column}`;

/** The pasted table with flagged cells marked, then one line per finding. */
const Results = ({ checked }: { checked: Checked }) => {
    const model = useModel();
    const prefix = useId();
    const captionId = useId();
    const [lit, setLit] = useState<string | null>(null);
    const { result, mapping, pasted } = checked;

    const located = result.findings.map((finding) => ({
        finding,
        at: locateFinding(mapping, finding),
    }));
    const marks = new Map<string, 'error' | 'warning'>();
    const flaggedRows = new Set<number>();
    for (const { finding, at } of located) {
        if (at === null) continue;
        flaggedRows.add(at.row);
        if (at.column === null) continue;
        const key = cellKey(at.row, at.column);
        if (marks.get(key) !== 'error') marks.set(key, finding.severity);
    }
    for (const row of result.refused) flaggedRows.add(Number(row.ref));
    const cellId = (key: string) => `${prefix}-${key.replace(':', '-')}`;

    const show = (key: string) => {
        setLit(key);
        document.getElementById(cellId(key))?.scrollIntoView({
            block: 'nearest',
            inline: 'center',
        });
    };

    return (
        <>
            <div
                className={styles.scroll}
                role="region"
                aria-labelledby={captionId}
                // The box scrolls sideways; a tab stop lets a keyboard scroll it.
                tabIndex={0}
            >
                <table className={styles.sheet}>
                    <caption id={captionId} className={styles.hidden}>
                        The pasted sheet with each flagged cell marked
                    </caption>
                    <thead>
                        <tr>
                            <th scope="col">Row</th>
                            {pasted.header.map((header, index) => (
                                // Pasted headers may repeat; the position is the identity.
                                <th key={index} scope="col">
                                    {header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {pasted.rows.map((cells, dataIndex) => {
                            const row = dataIndex + 2;
                            return (
                                <tr
                                    key={row}
                                    className={flaggedRows.has(row) ? undefined : styles.quiet}
                                >
                                    <th scope="row">{row}</th>
                                    {pasted.header.map((_, index) => {
                                        const key = cellKey(row, index);
                                        const mark = marks.get(key);
                                        return (
                                            <td
                                                key={index}
                                                id={cellId(key)}
                                                className={classNames(
                                                    mark && styles[mark],
                                                    lit === key && styles.lit,
                                                )}
                                            >
                                                {cells[index] ?? ''}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {(located.length > 0 || result.refused.length > 0) && (
                <ul className={styles.findings}>
                    {located.map(({ finding, at }, index) => {
                        const column =
                            at?.column === null || at?.column === undefined
                                ? finding.field
                                : (mapping[at.column]?.header ?? finding.field);
                        const key = at && at.column !== null ? cellKey(at.row, at.column) : null;
                        const place = `Row ${finding.ref ?? '?'}, ${column}`;
                        return (
                            // Findings carry no id; their order is fixed for a result.
                            <li key={index} className={styles.finding}>
                                <span
                                    className={classNames(
                                        styles.tag,
                                        finding.severity === 'error'
                                            ? styles.tagError
                                            : styles.tagWarning,
                                    )}
                                >
                                    {finding.severity === 'error' ? 'Error' : 'Warning'}
                                </span>
                                <span className={styles.findingText}>
                                    <span>
                                        {key ? (
                                            <button
                                                type="button"
                                                className={styles.place}
                                                onClick={() => show(key)}
                                            >
                                                {place}
                                            </button>
                                        ) : (
                                            <b className={styles.placeText}>{place}</b>
                                        )}
                                        . <Message parts={findingMessage(model, finding)} />
                                    </span>
                                    <Suggestions finding={finding} />
                                </span>
                            </li>
                        );
                    })}
                    {result.refused.map((row, index) => (
                        <li key={`refused-${index}`} className={styles.finding}>
                            <span className={classNames(styles.tag, styles.tagError)}>Error</span>
                            <span className={styles.findingText}>
                                <span>
                                    <b className={styles.placeText}>Row {row.ref ?? '?'}</b>. The
                                    Graph API refused this row: {row.detail}
                                </span>
                            </span>
                        </li>
                    ))}
                </ul>
            )}

            <div>
                <Button
                    onClick={() =>
                        downloadCsv(findingsCsvRows(model, mapping, result), 'sheet-findings.csv')
                    }
                >
                    Download CSV
                </Button>
            </div>
        </>
    );
};

const statusText = (run: Run): string => {
    if (run.status === 'running') {
        if (run.retryInMs !== null) {
            return `The graph is still being read. Trying again in ${Math.ceil(run.retryInMs / 1000)} s.`;
        }
        return `Checked ${run.checked.toLocaleString('en-GB')} of ${plural(run.total, 'row')}.`;
    }
    if (run.status === 'done') return resultSentence(run.checked.result, run.checked.rows);
    if (run.status === 'failed') return run.message;
    return '';
};

/** The three steps over a pasted range: paste, review the columns, check. */
const CheckSteps = () => {
    const model = useModel();
    const textId = useId();
    const [text, setText] = useState('');
    const [switches, setSwitches] = useState<ReadonlyMap<number, Switch>>(new Map());
    const [run, setRun] = useState<Run>({ status: 'idle' });
    const controller = useRef<AbortController | null>(null);

    useEffect(() => () => controller.current?.abort(), []);

    const pasted = useMemo(() => parsePasted(text), [text]);
    const read = useMemo(() => mapHeaders(model, pasted.header), [model, pasted.header]);
    const mapping = useMemo(
        () =>
            [...switches].reduce((current, [index, to]) => switchColumn(current, index, to), read),
        [read, switches],
    );
    const rows = useMemo(() => rowsToCheck(mapping, pasted.rows), [mapping, pasted.rows]);
    const example = useMemo(() => exampleSheet(model), [model]);

    const reset = () => {
        controller.current?.abort();
        setRun({ status: 'idle' });
    };
    const paste = (value: string) => {
        setText(value);
        setSwitches(new Map());
        reset();
    };
    const switchTo = (index: number, to: Switch | null) => {
        const next = new Map(switches);
        if (to === null) next.delete(index);
        else next.set(index, to);
        setSwitches(next);
        reset();
    };

    const check = async () => {
        controller.current?.abort();
        const abort = new AbortController();
        controller.current = abort;
        const snapshot = { mapping, pasted, rows: rows.length };
        setRun({ status: 'running', checked: 0, total: rows.length, retryInMs: null });
        try {
            const result = await checkRows(rows, {
                signal: abort.signal,
                onProgress: ({ checked, total }) =>
                    setRun({ status: 'running', checked, total, retryInMs: null }),
                onWait: (retryInMs) =>
                    setRun((current) =>
                        current.status === 'running' ? { ...current, retryInMs } : current,
                    ),
            });
            setRun({ status: 'done', checked: { ...snapshot, result } });
        } catch (error) {
            if (abort.signal.aborted) return;
            const message =
                error instanceof CheckError
                    ? error.message
                    : 'The check stopped on an unexpected error.';
            setRun({ status: 'failed', message });
        }
    };

    const hasRows = rows.length > 0;

    return (
        <>
            <Section title="1. Paste the sheet">
                <label htmlFor={textId} className={styles.lead}>
                    Copy the header row and the rows from a spreadsheet and paste them here.
                </label>
                <textarea
                    id={textId}
                    className={styles.paste}
                    value={text}
                    onChange={(event) => paste(event.target.value)}
                    rows={8}
                    spellCheck={false}
                    autoComplete="off"
                    wrap="off"
                />
                <div className={styles.actions}>
                    {example && (
                        <Button variant="bordered" small onClick={() => paste(example.text)}>
                            Try an Example
                        </Button>
                    )}
                    <p className={styles.note}>
                        The pasted sheet stays in this page and goes to the Graph API only to be
                        checked. Nothing is saved.
                    </p>
                </div>
                {example && text === example.text && (
                    <p className={styles.note}>
                        The example follows a pattern of <TermLink id={example.dataset} />, with one
                        value misspelt in the {example.misspelt} column.
                    </p>
                )}
            </Section>

            {pasted.header.length > 0 && (
                <Section title="2. The columns">
                    <p className={styles.note}>
                        {plural(rows.length, 'row')} to check. Each column is read as a definition
                        field, a property or ignored; switch any column between property and
                        ignored.
                    </p>
                    <ul className={styles.columns}>
                        {mapping.map((column) => (
                            <ColumnRow
                                key={column.index}
                                header={column.header}
                                read={read[column.index]?.target ?? column.target}
                                target={column.target}
                                onSwitch={(to) => switchTo(column.index, to)}
                            />
                        ))}
                    </ul>
                </Section>
            )}

            {pasted.header.length > 0 && (
                <Section title="3. Check against the graph">
                    <div>
                        <Button
                            variant="dark"
                            disabled={!hasRows || run.status === 'running'}
                            onClick={check}
                        >
                            Check Against the Graph
                        </Button>
                    </div>
                    <p
                        className={classNames(
                            styles.result,
                            run.status === 'failed' && styles.failed,
                        )}
                        role="status"
                    >
                        {statusText(run)}
                    </p>
                    {run.status === 'done' && <Results checked={run.checked} />}
                </Section>
            )}
        </>
    );
};

/**
 * Check a sheet: a range pasted from a filled mapping sheet, read into
 * candidate StatVar rows and checked against the graph. The model loads as
 * on the Explore screen.
 */
const CheckSheet = () => {
    const data = useExplorerData();
    const model = data.model.status === 'ready' ? data.model.value : null;
    const baseTerms =
        data.includeBase && data.terms?.status === 'ready' ? data.terms.value : undefined;

    return (
        <ModelProvider value={model}>
            <div className={shell.explorer}>
                <TopBar screen="check-sheet" model={model} baseTerms={baseTerms} />
                <main className={shell.main}>
                    <div className={styles.page}>
                        <header className={styles.header}>
                            <p className={styles.label}>Mapping sheets</p>
                            <h1 className={styles.title}>Check a sheet</h1>
                            <p className={styles.lead}>
                                Check a filled mapping sheet against the graph before any pipeline
                                code is written: every kind of thing, property and value it names,
                                and whether each value belongs to its property&rsquo;s value list.
                            </p>
                        </header>
                        {data.model.status === 'ready' ? (
                            <CheckSteps />
                        ) : (
                            <LoadStatus state={data.model} onRetry={data.retryModel} />
                        )}
                    </div>
                </main>
            </div>
        </ModelProvider>
    );
};

export default CheckSheet;
