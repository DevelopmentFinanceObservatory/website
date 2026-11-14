'use client';

import classNames from 'classnames';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import styles from './CheckSheet.module.scss';

import Button from '@/components/atoms/Button/Button';
import { downloadCsv } from '@/components/organisms/GraphExplorer/downloadCsv';
import { ModelProvider, useModel } from '@/components/organisms/GraphExplorer/ExploreContext';
import { BreakableId } from '@/components/organisms/GraphExplorer/BreakableId';
import { TermLink } from '@/components/organisms/GraphExplorer/ExploreLink';
import { plural } from '@/lib/graphExplorer/counts';
import shell from '@/components/organisms/GraphExplorer/GraphExplorer.module.scss';
import LoadStatus from '@/components/organisms/GraphExplorer/LoadStatus';
import SheetSection from '@/components/organisms/GraphExplorer/SheetSection';
import TopBar from '@/components/organisms/GraphExplorer/TopBar';
import { useExplorerData } from '@/components/organisms/GraphExplorer/useExplorerData';
import {
    cellKey,
    CheckError,
    checkRows,
    exampleSheet,
    closestLookup,
    FLAGGED_ROWS_STEP,
    findingLines,
    findingsCsvRows,
    flaggedRowCount,
    flaggedShownFor,
    QUIET_ROWS_STEP,
    resultSentence,
    sheetMarks,
    shownRows,
    type CheckResult,
    type MessagePart,
    type SheetMarks,
    type ShownRow,
} from '@/lib/graphExplorer/check';
import { waitText, type WaitCause } from '@/lib/graphExplorer/load';
import {
    applySwitches,
    mapHeaders,
    parsePasted,
    rowsToCheck,
    sheetProblems,
    sheetProblemText,
    type ColumnSwitch,
    type ColumnTarget,
    type Mapping,
    type PastedRange,
} from '@/lib/graphExplorer/pasted';

type Switch = 'property' | 'ignored';

/** The rows and columns a check ran on, kept with its result. */
type Checked = {
    readonly result: CheckResult;
    readonly mapping: Mapping;
    readonly pasted: PastedRange;
    /** The sheet row of each checked row. */
    readonly sheetRows: readonly number[];
};

type Run =
    | { readonly status: 'idle' }
    | {
          readonly status: 'running';
          readonly checked: number;
          readonly total: number;
          /** The wait under way, when the Graph API or the proxy asked for one. */
          readonly waiting: { readonly retryInMs: number; readonly cause: WaitCause } | null;
      }
    | { readonly status: 'done'; readonly checked: Checked }
    | { readonly status: 'failed'; readonly message: string };

const readAs = (target: ColumnTarget): string => {
    if (target.kind === 'definition') return `Definition field (${target.field})`;
    return target.kind === 'property' ? 'Property' : 'Ignored';
};

type ColumnRowProps = {
    header: string;
    read: ColumnTarget;
    target: ColumnTarget;
    /** The earlier column this one repeats, when it is ignored for that reason. */
    repeats: { readonly index: number; readonly header: string } | null;
    onSwitch: (to: Switch | null) => void;
};

/**
 * One pasted column: how the page read it, a switch between property and
 * ignored, and the earlier column it repeats, which keeps it ignored
 * whatever the switch says.
 */
const ColumnRow = ({ header, read, target, repeats, onSwitch }: ColumnRowProps) => {
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
            {repeats !== null && (
                <span className={styles.columnNote}>
                    Repeats column {repeats.index + 1} ({repeats.header || 'no header'})
                </span>
            )}
            {target.kind === 'property' && (
                <span className={styles.columnNote}>
                    {held ? (
                        <TermLink id={target.property} />
                    ) : (
                        <>
                            <code>
                                <BreakableId text={target.property} />
                            </code>{' '}
                            is not in the DFO model, so the check looks it up on the graph
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
                        <BreakableId text={part.text} />
                    </code>
                );
            }
            return <span key={at}>{part.text}</span>;
        })}
    </>
);

const Suggestions = ({ closest }: { closest: readonly string[] }) => {
    if (closest.length === 0) return null;
    return (
        <span className={styles.note}>
            Closest values:{' '}
            {closest.map((id, at) => (
                <span key={id}>
                    {at > 0 && ', '}
                    <TermLink id={id} />{' '}
                    <code className={styles.dcid}>
                        <BreakableId text={id} />
                    </code>
                </span>
            ))}
        </span>
    );
};

type SheetTableProps = {
    pasted: PastedRange;
    rows: readonly ShownRow[];
    marks: SheetMarks;
    cellId: (key: string) => string;
    rowId: (row: number) => string;
};

/** The shown rows of the pasted table, flagged cells marked. */
const SheetTable = ({ pasted, rows, marks, cellId, rowId }: SheetTableProps) => {
    const captionId = useId();
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
                    The pasted sheet with each flagged cell marked
                </caption>
                <thead>
                    <tr>
                        <th scope="col">Row</th>
                        {pasted.header.map((header, index) => (
                            // Pasted headers may repeat, so the position is the identity.
                            <th key={index} scope="col">
                                {header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map(({ dataIndex, row }) => {
                        const cells = pasted.rows[dataIndex] ?? [];
                        return (
                            <tr
                                key={row}
                                id={rowId(row)}
                                className={marks.flaggedRows.has(row) ? undefined : styles.quiet}
                                // "Show N More" moves focus here when its last step unmounts it.
                                tabIndex={-1}
                            >
                                <th scope="row">{row}</th>
                                {pasted.header.map((_, index) => {
                                    const key = cellKey(row, index);
                                    const mark = marks.cells.get(key);
                                    return (
                                        <td
                                            key={index}
                                            id={cellId(key)}
                                            className={mark && styles[mark]}
                                            // A finding's place control moves focus here.
                                            tabIndex={mark ? -1 : undefined}
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
    );
};

type ShowMoreProps = {
    /** The line saying what is not shown. */
    note: string;
    hidden: number;
    step: number;
    /** Shows one more step. `last` is true when it shows everything left. */
    onShow: (last: boolean) => void;
};

/** "N more ... not shown" and a "Show N More" button, while anything is hidden. */
const ShowMore = ({ note, hidden, step, onShow }: ShowMoreProps) => {
    if (hidden <= 0) return null;
    return (
        <div className={styles.actions}>
            <p className={styles.note}>{note}</p>
            <Button variant="bordered" small onClick={() => onShow(hidden <= step)}>
                Show {Math.min(hidden, step).toLocaleString('en-GB')} More
            </Button>
        </div>
    );
};

/** Where focus goes once a "Show N More" that showed its last step unmounts. */
type FocusAfter = { readonly list: 'flagged' | 'quiet' | 'findings'; readonly from: number };

/** The pasted table with flagged cells marked, then one line per finding. */
const Results = ({ checked }: { checked: Checked }) => {
    const model = useModel();
    const prefix = useId();
    const [quietShown, setQuietShown] = useState(0);
    const [flaggedShown, setFlaggedShown] = useState(FLAGGED_ROWS_STEP);
    const [findingsShown, setFindingsShown] = useState(FLAGGED_ROWS_STEP);
    const lit = useRef<HTMLElement | null>(null);
    const focusAfter = useRef<FocusAfter | null>(null);
    // The cell to light and focus once the row holding it is rendered.
    const pending = useRef<string | null>(null);
    const { result, mapping, pasted, sheetRows } = checked;

    const lines = useMemo(
        () => findingLines(model, mapping, sheetRows, result.findings),
        [model, mapping, sheetRows, result.findings],
    );
    const marks = useMemo(
        () => sheetMarks(lines, result.refused, sheetRows),
        [lines, result.refused, sheetRows],
    );
    const shownLines = useMemo(() => lines.slice(0, findingsShown), [lines, findingsShown]);
    // The closest values for the lines on screen only, each property and value pair once per model.
    const closest = useMemo(() => closestLookup(model), [model]);
    const suggestions = useMemo(
        () => shownLines.map((line) => closest(line.finding)),
        [closest, shownLines],
    );
    const shown = useMemo(
        () =>
            shownRows(pasted.rows.length, marks.flaggedRows, {
                flagged: flaggedShown,
                quiet: quietShown,
            }),
        [pasted.rows.length, marks.flaggedRows, flaggedShown, quietShown],
    );
    const cellId = useCallback((key: string) => `${prefix}-${key.replace(':', '-')}`, [prefix]);
    const rowId = useCallback((row: number) => `${prefix}-row-${row}`, [prefix]);
    const lineId = useCallback((at: number) => `${prefix}-line-${at}`, [prefix]);
    const lineCount = lines.length + result.refused.length;
    const shownRefused = result.refused.slice(0, Math.max(0, findingsShown - lines.length));

    // The highlight is set on the cells directly, so a click does not re-render the table.
    const light = useCallback(
        (key: string) => {
            const cell = document.getElementById(cellId(key));
            if (!cell) return false;
            lit.current?.classList.remove(styles.lit);
            cell.classList.add(styles.lit);
            lit.current = cell;
            cell.scrollIntoView({ block: 'nearest', inline: 'center' });
            cell.focus({ preventScroll: true });
            return true;
        },
        [cellId],
    );

    useEffect(() => {
        if (pending.current !== null && light(pending.current)) pending.current = null;
    }, [shown, light]);

    useEffect(() => {
        const next = focusAfter.current;
        if (next === null) return;
        focusAfter.current = null;
        if (next.list === 'findings') {
            document.getElementById(lineId(next.from))?.focus();
            return;
        }
        const flagged = next.list === 'flagged';
        const row = shown.rows.filter(({ row }) => marks.flaggedRows.has(row) === flagged)[
            next.from
        ]?.row;
        if (row !== undefined) document.getElementById(rowId(row))?.focus();
    }, [shown, findingsShown, marks.flaggedRows, lineId, rowId]);

    /** Records where focus goes when this step is the last, from the count shown before it. */
    const showStep = (list: FocusAfter['list'], from: number, last: boolean) => {
        if (last) focusAfter.current = { list, from };
    };

    // A finding on a flagged row not yet shown reveals the steps up to it first.
    const show = (key: string, row: number) => {
        if (light(key)) return;
        pending.current = key;
        setFlaggedShown((count) => flaggedShownFor(marks.flaggedRows, row, count));
    };

    return (
        <>
            <SheetTable
                pasted={pasted}
                rows={shown.rows}
                marks={marks}
                cellId={cellId}
                rowId={rowId}
            />
            <ShowMore
                note={`${plural(shown.hiddenFlagged, 'more flagged row')} not shown.`}
                hidden={shown.hiddenFlagged}
                step={FLAGGED_ROWS_STEP}
                onShow={(last) => {
                    showStep('flagged', flaggedShown, last);
                    setFlaggedShown((count) => count + FLAGGED_ROWS_STEP);
                }}
            />
            <ShowMore
                note={`${plural(shown.hiddenQuiet, 'more row')} without findings not shown.`}
                hidden={shown.hiddenQuiet}
                step={QUIET_ROWS_STEP}
                onShow={(last) => {
                    showStep('quiet', quietShown, last);
                    setQuietShown((count) => count + QUIET_ROWS_STEP);
                }}
            />

            {lineCount > 0 && (
                <ul className={styles.findings}>
                    {shownLines.map((line, index) => {
                        const { finding, row, column, columnLabel } = line;
                        const key = row !== null && column !== null ? cellKey(row, column) : null;
                        const place = `Row ${row ?? '?'}, ${columnLabel}`;
                        return (
                            // Findings carry no id, and their order is fixed for a result.
                            <li
                                key={index}
                                id={lineId(index)}
                                className={styles.finding}
                                tabIndex={-1}
                            >
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
                                        {key !== null && row !== null ? (
                                            <button
                                                type="button"
                                                className={styles.place}
                                                onClick={() => show(key, row)}
                                            >
                                                {place}
                                            </button>
                                        ) : (
                                            <b className={styles.placeText}>{place}</b>
                                        )}
                                        . <Message parts={line.parts} />
                                    </span>
                                    <Suggestions closest={suggestions[index] ?? []} />
                                </span>
                            </li>
                        );
                    })}
                    {shownRefused.map((refusal, index) => (
                        <li
                            key={`refused-${index}`}
                            id={lineId(lines.length + index)}
                            className={styles.finding}
                            tabIndex={-1}
                        >
                            <span className={classNames(styles.tag, styles.tagError)}>Error</span>
                            <span className={styles.findingText}>
                                <span>
                                    <b className={styles.placeText}>
                                        Row {sheetRows[refusal.index] ?? '?'}
                                    </b>
                                    . The Graph API refused this row: {refusal.detail}
                                </span>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
            <ShowMore
                note={`${plural(lineCount - findingsShown, 'more finding')} not shown.`}
                hidden={lineCount - findingsShown}
                step={FLAGGED_ROWS_STEP}
                onShow={(last) => {
                    showStep('findings', findingsShown, last);
                    setFindingsShown((count) => count + FLAGGED_ROWS_STEP);
                }}
            />

            <div>
                <Button
                    onClick={() =>
                        downloadCsv(
                            findingsCsvRows(lines, result.refused, sheetRows),
                            'sheet-findings.csv',
                        )
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
        if (run.waiting !== null) return waitText(run.waiting.retryInMs, run.waiting.cause);
        return `Checked ${run.checked.toLocaleString('en-GB')} of ${plural(run.total, 'row')}.`;
    }
    if (run.status === 'done') {
        return resultSentence(run.checked.result, run.checked.sheetRows.length);
    }
    if (run.status === 'failed') return run.message;
    return '';
};

/** How long typing in the paste box pauses before the pasted text is read again. */
const READ_PAUSE_MS = 300;

/** The three steps over a pasted range: paste, review the columns, check. */
const CheckSteps = () => {
    const model = useModel();
    const textId = useId();
    const [text, setText] = useState('');
    // The text the columns and rows are read from, which is `text` once typing pauses.
    const [settled, setSettled] = useState('');
    const [switches, setSwitches] = useState<ReadonlyMap<number, ColumnSwitch>>(new Map());
    const [run, setRun] = useState<Run>({ status: 'idle' });
    const controller = useRef<AbortController | null>(null);

    useEffect(() => () => controller.current?.abort(), []);
    useEffect(() => {
        if (text === settled) return;
        const timer = setTimeout(() => setSettled(text), READ_PAUSE_MS);
        return () => clearTimeout(timer);
    }, [text, settled]);

    const pasted = useMemo(() => parsePasted(settled), [settled]);
    const read = useMemo(() => mapHeaders(model, pasted.header), [model, pasted.header]);
    const mapping = useMemo(() => applySwitches(read, switches), [read, switches]);
    const sheet = useMemo(() => rowsToCheck(mapping, pasted.rows), [mapping, pasted.rows]);
    const problems = useMemo(() => sheetProblems(mapping, sheet), [mapping, sheet]);
    const example = useMemo(() => exampleSheet(model), [model]);
    const reading = text !== settled;

    const reset = () => {
        controller.current?.abort();
        setRun({ status: 'idle' });
    };
    const paste = (value: string) => {
        setText(value);
        reset();
    };
    const pasteNow = (value: string) => {
        paste(value);
        setSettled(value);
    };
    const switchTo = (index: number, to: Switch | null) => {
        const next = new Map(switches);
        const header = read[index]?.header;
        if (to === null || header === undefined) next.delete(index);
        else next.set(index, { header, to });
        setSwitches(next);
        reset();
    };

    const check = async () => {
        controller.current?.abort();
        const abort = new AbortController();
        controller.current = abort;
        const { rows, sheetRows } = sheet;
        const snapshot = { mapping, pasted, sheetRows };
        // A late answer from a check the reader has moved on from changes nothing.
        const update = (next: Run | ((current: Run) => Run)) => {
            if (!abort.signal.aborted) setRun(next);
        };
        update({ status: 'running', checked: 0, total: rows.length, waiting: null });
        try {
            const result = await checkRows(rows, {
                signal: abort.signal,
                onProgress: ({ checked, total }) =>
                    update({ status: 'running', checked, total, waiting: null }),
                onWait: (retryInMs, cause) =>
                    update((current) =>
                        current.status === 'running'
                            ? { ...current, waiting: { retryInMs, cause } }
                            : current,
                    ),
            });
            update({ status: 'done', checked: { ...snapshot, result } });
        } catch (error) {
            if (abort.signal.aborted) return;
            if (!(error instanceof CheckError)) {
                console.error('Graph Explorer: the check failed', error);
            }
            const message =
                error instanceof CheckError
                    ? error.message
                    : 'The check stopped on an unexpected error.';
            update({ status: 'failed', message });
        }
    };

    const canCheck = sheet.rows.length > 0 && problems.length === 0;
    // A check with nothing to show is its result line alone, marked as passed.
    const clean = run.status === 'done' && flaggedRowCount(run.checked.result) === 0;
    const repeated = mapping
        .filter((column) => column.duplicateOf !== null)
        .map(
            (column) =>
                `${column.header || '(no header)'} (column ${column.index + 1}, repeating column ${(column.duplicateOf ?? 0) + 1})`,
        );

    return (
        <>
            <SheetSection title="1. Paste the sheet">
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
                        <Button variant="bordered" small onClick={() => pasteNow(example.text)}>
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
            </SheetSection>

            {pasted.header.length > 0 && (
                <SheetSection title="2. The columns">
                    <p className={styles.note}>
                        {plural(sheet.rows.length, 'row')} to check. Each column is read as a
                        definition field, a property or ignored. Switch any column between property
                        and ignored.
                    </p>
                    {repeated.length > 0 && (
                        <p className={styles.note}>
                            Set to Ignored because an earlier column has the same property or field:{' '}
                            {repeated.join(', ')}.
                        </p>
                    )}
                    <ul className={styles.columns}>
                        {mapping.map((column) => (
                            <ColumnRow
                                key={column.index}
                                header={column.header}
                                read={read[column.index]?.wanted ?? column.wanted}
                                target={column.target}
                                repeats={
                                    column.duplicateOf === null
                                        ? null
                                        : {
                                              index: column.duplicateOf,
                                              header: mapping[column.duplicateOf]?.header ?? '',
                                          }
                                }
                                onSwitch={(to) => switchTo(column.index, to)}
                            />
                        ))}
                    </ul>
                </SheetSection>
            )}

            {pasted.header.length > 0 && (
                <SheetSection title="3. Check against the graph">
                    {problems.length > 0 && (
                        <ul className={styles.problems}>
                            {problems.map((problem) => (
                                <li key={`${problem.code}:${problem.column ?? ''}`}>
                                    {sheetProblemText(problem)}
                                </li>
                            ))}
                        </ul>
                    )}
                    <div>
                        <Button
                            variant="dark"
                            disabled={!canCheck || reading || run.status === 'running'}
                            onClick={check}
                        >
                            Check Against the Graph
                        </Button>
                    </div>
                    <p
                        className={classNames(
                            styles.result,
                            run.status === 'failed' && styles.failed,
                            clean && styles.clean,
                        )}
                        role="status"
                    >
                        {statusText(run)}
                    </p>
                    {run.status === 'done' && !clean && <Results checked={run.checked} />}
                </SheetSection>
            )}
        </>
    );
};

/**
 * Check a sheet: a range pasted from a filled mapping sheet, read into
 * candidate StatVar rows and checked against the graph. The model is the
 * one the section's layout loaded.
 */
const CheckSheet = () => {
    const data = useExplorerData();
    const model = data.model.status === 'ready' ? data.model.value : null;

    return (
        <ModelProvider value={model}>
            <div className={shell.explorer}>
                <TopBar />
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
