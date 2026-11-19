'use client';

import classNames from 'classnames';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import styles from './CheckSheet.module.scss';

import Button from '@/components/atoms/Button/Button';
import { downloadCsv } from '@/components/organisms/GraphExplorer/downloadCsv';
import { useModel } from '@/components/organisms/GraphExplorer/ExploreContext';
import { BreakableId } from '@/components/organisms/GraphExplorer/BreakableId';
import { TermLink } from '@/components/organisms/GraphExplorer/ExploreLink';
import SheetSection from '@/components/organisms/GraphExplorer/SheetSection';
import { useExplorerData } from '@/components/organisms/GraphExplorer/useExplorerData';
import { plural } from '@/lib/graphExplorer/counts';
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
    readPasted,
    readSummaryText,
    sameReading,
    sheetProblems,
    sheetProblemText,
    switchRead,
    type ColumnSwitch,
    type ColumnTarget,
    type Mapping,
    type PastedRange,
    type PrefixFinding,
} from '@/lib/graphExplorer/pasted';

type Switch = 'property' | 'ignored';

/** The rows and columns a check ran on, kept with its result. */
type Checked = {
    readonly result: CheckResult;
    readonly mapping: Mapping;
    readonly pasted: PastedRange;
    /** The sheet row of each checked row. */
    readonly sheetRows: readonly number[];
    /** The sheet rows the check was not sent, as rows that reuse a StatVar. */
    readonly skipped: ReadonlySet<number>;
    /** The cells that lack the `dcid:` prefix, as the page read them. */
    readonly prefix: readonly PrefixFinding[];
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
    skipped: ReadonlySet<number>;
    cellId: (key: string) => string;
    rowId: (row: number) => string;
};

/** The shown rows of the pasted table, flagged cells marked. */
const SheetTable = ({ pasted, rows, marks, skipped, cellId, rowId }: SheetTableProps) => {
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
                                <th scope="row">
                                    {row}
                                    {skipped.has(row) && (
                                        <span className={styles.skipTag}> skipped</span>
                                    )}
                                </th>
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

/** "N more rows without findings and M skipped rows not shown." */
const quietNote = (quiet: number, skipped: number): string => {
    const parts = [
        ...(quiet > 0 ? [`${plural(quiet, 'more row')} without findings`] : []),
        ...(skipped > 0 ? [`${plural(skipped, 'skipped row')}`] : []),
    ];
    return `${parts.join(' and ')} not shown.`;
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
    const { result, mapping, pasted, sheetRows, skipped, prefix: prefixFound } = checked;

    const lines = useMemo(
        () => findingLines(model, mapping, sheetRows, result.findings),
        [model, mapping, sheetRows, result.findings],
    );
    const marks = useMemo(
        () => sheetMarks(lines, result.refused, sheetRows, prefixFound),
        [lines, result.refused, sheetRows, prefixFound],
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
            shownRows(
                pasted.rows.length,
                marks.flaggedRows,
                { flagged: flaggedShown, quiet: quietShown },
                skipped,
            ),
        [pasted.rows.length, marks.flaggedRows, flaggedShown, quietShown, skipped],
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
                skipped={skipped}
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
                note={quietNote(shown.hiddenQuiet, shown.hiddenSkipped)}
                hidden={shown.hiddenQuiet + shown.hiddenSkipped}
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
                            findingsCsvRows(lines, result.refused, sheetRows, prefixFound),
                            'seed-findings.csv',
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
        const { result, sheetRows, prefix } = run.checked;
        const sentence = resultSentence(result, sheetRows.length);
        if (prefix.length > 0) {
            return `${sentence} ${plural(prefix.length, 'cell')} ${prefix.length === 1 ? 'lacks' : 'lack'} the dcid: prefix.`;
        }
        return flaggedRowCount(result) === 0
            ? `${sentence} The check does not cover unit or measurement_method.`
            : sentence;
    }
    if (run.status === 'failed') return run.message;
    return '';
};

/** How long typing in the paste box pauses before the pasted text is read again. */
const READ_PAUSE_MS = 300;

/** The largest file the page reads, well past any seed or StatVar output. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** The cells of a checked seed column that lack the `dcid:` prefix, one line each. */
const PrefixLines = ({ found }: { found: readonly PrefixFinding[] }) => {
    if (found.length === 0) return null;
    return (
        <ul className={styles.findings}>
            {found.map(({ column, header, row, value }) => (
                <li key={`${row}:${column}`} className={styles.finding}>
                    <span className={classNames(styles.tag, styles.tagWarning)}>Warning</span>
                    <span className={styles.findingText}>
                        <span>
                            <b className={styles.placeText}>
                                Row {row}, {header}
                            </b>
                            . <code className={styles.value}>{value}</code> has no{' '}
                            <code className={styles.value}>dcid:</code> prefix. Write{' '}
                            <code className={styles.value}>dcid:{value}</code> if it names a node of
                            the graph.
                        </span>
                    </span>
                </li>
            ))}
        </ul>
    );
};

/** The status line for a check whose columns read differently since it ran. */
const STALE_TEXT =
    'The columns read differently from when this check ran, so its result is not shown. Check again to see one for them.';

/**
 * The check step. A filled seed or StatVar output, pasted or chosen as a
 * `.csv` file, is read into check rows, summarised, and checked against the
 * graph. A sheet for a base or UN dataset (`outsideDataset`) reads its
 * headers against every usage document loaded, so a seed copied from it
 * keeps its outside properties whatever the switches say. A sheet for a
 * DFO dataset reads them against the scoped model's schema alone.
 */
const CheckSheet = ({ title, outsideDataset }: { title: string; outsideDataset: boolean }) => {
    const model = useModel();
    const full = useExplorerData().full;
    const headerModel = outsideDataset && full !== null ? full : model;
    const textId = useId();
    const fileInput = useRef<HTMLInputElement | null>(null);
    const [text, setText] = useState('');
    // The text as last set, which a file read that finishes late compares against.
    const latest = useRef('');
    // The text the columns and rows are read from, which is `text` once typing pauses.
    const [settled, setSettled] = useState('');
    // What came of the last chosen file, until the text changes.
    const [fileNote, setFileNote] = useState<string | null>(null);
    const [switches, setSwitches] = useState<ReadonlyMap<number, ColumnSwitch>>(new Map());
    const [run, setRun] = useState<Run>({ status: 'idle' });
    const controller = useRef<AbortController | null>(null);

    useEffect(() => () => controller.current?.abort(), []);
    useEffect(() => {
        if (text === settled) return;
        const timer = setTimeout(() => setSettled(text), READ_PAUSE_MS);
        return () => clearTimeout(timer);
    }, [text, settled]);

    // The page's own reading of each column, which a reader's switch overrides.
    const read = useMemo(
        () => readPasted(headerModel, settled, new Map(), { outsideDataset }),
        [headerModel, settled, outsideDataset],
    );
    const current = useMemo(
        () => (switches.size === 0 ? read : switchRead(headerModel, read, switches)),
        [headerModel, switches, read],
    );
    const { range: pasted, mapping, sheet, summary } = current;
    const problems = useMemo(() => sheetProblems(mapping, sheet), [mapping, sheet]);
    const example = useMemo(() => exampleSheet(model), [model]);
    const reading = text !== settled;

    const reset = () => {
        controller.current?.abort();
        setRun({ status: 'idle' });
    };
    const paste = (value: string) => {
        latest.current = value;
        setText(value);
        setFileNote(null);
        reset();
    };
    const pasteNow = (value: string) => {
        paste(value);
        setSettled(value);
    };
    const choose = async (chosen: File | undefined) => {
        if (chosen === undefined) return;
        if (chosen.size > MAX_FILE_BYTES) {
            setFileNote(
                `${chosen.name} is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB, more than a seed or StatVar output holds.`,
            );
            return;
        }
        const before = latest.current;
        let bytes: ArrayBuffer;
        try {
            bytes = await chosen.arrayBuffer();
        } catch (error) {
            console.error('Graph Explorer: the chosen file could not be read', error);
            setFileNote(`${chosen.name} could not be read.`);
            return;
        }
        let content: string;
        try {
            content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch {
            // A fatal decoder throws only on bytes that are not UTF-8.
            setFileNote(
                `${chosen.name} is not UTF-8 text. Save it as CSV UTF-8 and choose it again.`,
            );
            return;
        }
        // Text typed or pasted while the file loaded is the reader's newer choice.
        if (latest.current !== before) return;
        pasteNow(content);
        setFileNote(`Read from ${chosen.name}.`);
    };
    const switchTo = (index: number, to: Switch | null) => {
        const next = new Map(switches);
        const header = read.mapping[index]?.header;
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
        const snapshot = {
            mapping,
            pasted,
            sheetRows,
            skipped: new Set(sheet.skipped),
            prefix: current.prefixFindings,
        };
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
    // A reading that changed under a finished check, as when an outside usage document lands or
    // the seed's dataset changes, leaves its result describing other columns, so a line replaces it.
    const stale = run.status === 'done' && !sameReading(run.checked.mapping, mapping);
    // A check with nothing to show is its result line alone, marked as passed.
    const clean =
        !stale &&
        run.status === 'done' &&
        flaggedRowCount(run.checked.result) === 0 &&
        run.checked.prefix.length === 0;

    return (
        <SheetSection title={title}>
            <label htmlFor={textId} className={styles.lead}>
                Paste the filled seed or the output of <code>dc_&lt;dataset&gt;_statvars</code>,
                header row first, or choose a .csv file. The page reads either and says what it
                read.
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
                <input
                    ref={fileInput}
                    type="file"
                    accept=".csv,text/csv"
                    className={styles.hidden}
                    // The button below opens the picker, so the input takes no tab stop.
                    tabIndex={-1}
                    aria-hidden
                    onChange={(event) => {
                        void choose(event.target.files?.[0]);
                        event.target.value = '';
                    }}
                />
                <Button variant="bordered" small onClick={() => fileInput.current?.click()}>
                    Choose a .csv File
                </Button>
                {example && (
                    <Button variant="bordered" small onClick={() => pasteNow(example.text)}>
                        Try an Example
                    </Button>
                )}
                <p className={styles.note}>
                    The seed stays in this page and goes to the Graph API only to be checked.
                    Nothing is saved.
                </p>
            </div>
            {fileNote !== null && (
                <p className={styles.note} role="status">
                    {fileNote}
                </p>
            )}
            {example && text === example.text && (
                <p className={styles.note}>
                    The example follows a pattern of <TermLink id={example.dataset} />, with one
                    value misspelt in the {example.misspelt} column.
                </p>
            )}

            {pasted.header.length > 0 && (
                <>
                    <p className={styles.summary} role="status">
                        {readSummaryText(summary)}
                    </p>
                    <PrefixLines found={current.prefixFindings} />
                    <details className={styles.more}>
                        <summary>Change how a column is read</summary>
                        <p className={styles.note}>
                            Each column is read as an identity field (population type, measured
                            property, stat type and the others), a constraint, or not checked.
                            Switch any column between Property and Ignored.
                        </p>
                        <ul className={styles.columns}>
                            {mapping.map((column) => (
                                <ColumnRow
                                    key={column.index}
                                    header={column.header}
                                    read={read.mapping[column.index]?.wanted ?? column.wanted}
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
                    </details>
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
                        {stale ? STALE_TEXT : statusText(run)}
                    </p>
                    {run.status === 'done' && !clean && !stale && <Results checked={run.checked} />}
                </>
            )}
        </SheetSection>
    );
};

export default CheckSheet;
