'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useId, useMemo, useState } from 'react';

import styles from './NewSheet.module.scss';
import { CreateGoogleSheet, DownloadCsv } from './SheetExports';

import {
    ModelProvider,
    useCarried,
    useModel,
} from '@/components/organisms/GraphExplorer/ExploreContext';
import { TermLink } from '@/components/organisms/GraphExplorer/ExploreLink';
import { count, plural, valueCount } from '@/lib/graphExplorer/counts';
import shell from '@/components/organisms/GraphExplorer/GraphExplorer.module.scss';
import LoadStatus from '@/components/organisms/GraphExplorer/LoadStatus';
import SheetSection from '@/components/organisms/GraphExplorer/SheetSection';
import TopBar from '@/components/organisms/GraphExplorer/TopBar';
import { useExplorerData } from '@/components/organisms/GraphExplorer/useExplorerData';
import { NO_CARRIED, type Carried } from '@/lib/graphExplorer/explore';
import {
    openingMemory,
    takeConsentTrip,
    type ConsentTrip,
    type CreateMemory,
} from '@/lib/graphExplorer/googleConsent';
import {
    queryOf,
    readSheetQuery,
    resolveSheet,
    sheetHref,
    sheetQuery,
    type SheetQuery,
    type SheetSelection,
    type SplitOption,
    type UnknownChoice,
} from '@/lib/graphExplorer/newSheet';
import { patternSentence } from '@/lib/graphExplorer/sentence';
import { closestPattern, sheetDraft, type SheetDraft } from '@/lib/graphExplorer/sheet';

/**
 * Replaces the page's query in place and keeps the carried parameters. The
 * URL holds the sheet, and the back button skips edits.
 */
const writeQuery = (query: SheetQuery, carried: Carried) =>
    window.history.replaceState(null, '', sheetHref(query, carried));

type SplitBoxProps = { option: SplitOption; checked: boolean; onToggle: () => void };

/** One tick box: the property, its value list and size, and the datasets that use it. */
const SplitBox = ({ option, checked, onToggle }: SplitBoxProps) => {
    const model = useModel();
    return (
        <label className={styles.check}>
            <input type="checkbox" checked={checked} onChange={onToggle} />
            <span className={styles.grow}>
                <span className={styles.term}>{model.label(option.id)}</span>{' '}
                <span className={styles.dcid}>{option.id}</span>
                {option.valueLists.length > 0 && (
                    <span className={styles.from}>
                        from {option.valueLists.map((id) => model.label(id)).join(', ')},{' '}
                        {valueCount(option.members, option.membersComplete)}
                    </span>
                )}
            </span>
            {option.datasets.length > 0 && (
                <span className={styles.users}>
                    {option.datasets.map((id) => model.label(id)).join(', ')}
                </span>
            )}
        </label>
    );
};

const PARAM_NOUNS: Readonly<Record<UnknownChoice['param'], string>> = {
    class: 'kind of thing',
    measured: 'measured property',
    split: 'property',
    pattern: 'pattern',
};

/** The line naming the URL's ids the model does not offer, which their defaults replace. */
const UnknownChoices = ({ unknown }: { unknown: readonly UnknownChoice[] }) => (
    <p className={styles.note} role="status">
        The model does not offer{' '}
        {unknown.map((choice, at) => (
            <span key={`${choice.param}:${choice.id}`}>
                {at > 0 && (at === unknown.length - 1 ? ' or ' : ', ')}
                the {PARAM_NOUNS[choice.param]}{' '}
                {choice.param === 'pattern' ? (
                    <>
                        {choice.index} of <code>{choice.id}</code>
                    </>
                ) : (
                    <code>{choice.id}</code>
                )}
            </span>
        ))}{' '}
        so the sheet uses its defaults.
    </p>
);

/**
 * The properties no dataset splits by yet, folded away. The reader opens and
 * closes the list, and ticking a box leaves it open so a focused checkbox
 * stays in view. It opens on first render when one of them is ticked.
 */
const MoreProperties = ({
    unused,
    ticked,
    classLabel,
    box,
}: {
    unused: readonly SplitOption[];
    ticked: ReadonlySet<string>;
    classLabel: string;
    box: (option: SplitOption) => React.ReactNode;
}) => {
    const [open, setOpen] = useState(() => unused.some((option) => ticked.has(option.id)));
    return (
        <details
            className={styles.more}
            open={open}
            onToggle={(event) => setOpen(event.currentTarget.open)}
        >
            <summary>
                {plural(unused.length, 'more property', 'more properties')} declared for{' '}
                {classLabel} that no dataset splits by yet
            </summary>
            <div className={styles.checks}>{unused.map(box)}</div>
        </details>
    );
};

/** The closest existing pattern as a sentence, with the rule that chose it. */
const Closest = ({ selection }: { selection: SheetSelection }) => {
    const model = useModel();
    const closest = closestPattern(model, selection.classId, selection.properties);
    const ticked = selection.properties.length;

    return (
        <>
            {closest ? (
                <p className={styles.lead}>
                    The closest existing pattern is in <TermLink id={closest.dataset} />:{' '}
                    {patternSentence(model, closest.pattern).map((part, at) =>
                        part.kind === 'term' ? (
                            <TermLink key={at} id={part.id} />
                        ) : (
                            <span key={at}>{part.text}</span>
                        ),
                    )}{' '}
                    It splits by {count(closest.shared)} of your{' '}
                    {plural(ticked, 'ticked property', 'ticked properties')} and holds{' '}
                    {plural(closest.pattern.stat_var_count, 'StatVar')}.
                </p>
            ) : (
                <p className={styles.lead}>
                    {ticked === 0
                        ? 'Tick a property to see the closest existing pattern.'
                        : 'No dataset pattern about this kind of thing splits by any of the ticked properties.'}
                </p>
            )}
            <p className={styles.note}>
                The closest pattern is the one about this kind of thing, or a narrower kind, that
                splits by the most of the ticked properties. A tie goes to the pattern with more
                StatVars.
            </p>
        </>
    );
};

/** The sheet's columns over the example rows, scrolling inside its own box. */
const Preview = ({ sheet }: { sheet: SheetDraft }) => {
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
                    The sheet&rsquo;s columns with three example rows
                </caption>
                <thead>
                    <tr>
                        {sheet.columns.map((column) => (
                            <th key={column.name} scope="col">
                                {column.name}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {sheet.rows.map((row, at) => (
                        // The example rows are fixed in number and order.
                        <tr key={at}>
                            {row.map((value, index) => (
                                <td
                                    key={sheet.columns[index]?.name ?? index}
                                    className={
                                        sheet.columns[index]?.kind === 'reference'
                                            ? styles.example
                                            : undefined
                                    }
                                >
                                    {value}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

/** Each value-list column with a link to its value list in Explore. */
const ValueLists = ({ sheet }: { sheet: SheetDraft }) => {
    const listed = sheet.columns.filter((column) => column.lookup !== null);
    if (listed.length === 0) return null;
    return (
        <ul className={styles.lists}>
            {listed.map((column) => (
                <li key={column.name}>
                    <span className={styles.dcid}>{column.name}</span> takes a value from{' '}
                    {column.lookup?.lists.map((id, at) => (
                        <span key={id}>
                            {at > 0 && ', '}
                            <TermLink id={id} />
                        </span>
                    ))}{' '}
                    <span className={styles.size}>
                        (
                        {valueCount(
                            column.lookup?.members.length ?? 0,
                            column.lookup?.complete ?? true,
                        )}
                        )
                    </span>
                </li>
            ))}
        </ul>
    );
};

/**
 * The four steps, top to bottom, over the model and the URL's choices.
 * `trip` is the Google consent trip the page opened after.
 */
const SheetSteps = ({ trip }: { trip: ConsentTrip }) => {
    const model = useModel();
    const params = useSearchParams();
    const carried = useCarried();
    const selection = useMemo(() => resolveSheet(model, readSheetQuery(params)), [model, params]);
    // The draft the page opened on is the one the reader returned to from the consent screen.
    const [createMemory, setCreateMemory] = useState<CreateMemory>(() =>
        openingMemory(trip, selection ? sheetQuery(queryOf(selection), NO_CARRIED) : ''),
    );
    const sheet = useMemo(
        (): SheetDraft | null =>
            selection && sheetDraft(model, { ...selection.spec, classId: selection.classId }),
        [model, selection],
    );

    if (!selection || !sheet) {
        return (
            <p className={styles.lead} role="status">
                No dataset pattern names a kind of thing yet, so there is nothing to start from.
            </p>
        );
    }

    const current = queryOf(selection);
    const ticked = new Set(selection.properties);
    const toggle = (id: string) =>
        writeQuery(
            {
                ...current,
                split: ticked.has(id)
                    ? selection.properties.filter((property) => property !== id)
                    : [...selection.properties, id],
            },
            carried,
        );
    const inUse = selection.splitOptions.filter((option) => option.inUse);
    const unused = selection.splitOptions.filter((option) => !option.inUse);
    const box = (option: SplitOption) => (
        <SplitBox
            key={option.id}
            option={option}
            checked={ticked.has(option.id)}
            onToggle={() => toggle(option.id)}
        />
    );
    const classLabel = model.label(selection.classId);

    return (
        <>
            {selection.unknown.length > 0 && <UnknownChoices unknown={selection.unknown} />}
            <SheetSection title="1. What are the figures about?">
                <div className={styles.pick} role="group" aria-label="Kind of thing">
                    {model.populationTypes().map((use) => (
                        <button
                            key={use.classId}
                            type="button"
                            className={styles.choice}
                            aria-pressed={use.classId === selection.classId}
                            onClick={() =>
                                writeQuery(
                                    {
                                        classId: use.classId,
                                        measured: null,
                                        split: null,
                                        from: null,
                                    },
                                    carried,
                                )
                            }
                        >
                            <span className={styles.choiceName}>{model.label(use.classId)}</span>
                            <span className={styles.choiceMeta}>
                                {plural(use.datasets, 'dataset')}, {plural(use.statVars, 'StatVar')}
                            </span>
                            {model.node(use.classId)?.description && (
                                <span className={styles.choiceText}>
                                    {model.node(use.classId)?.description}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </SheetSection>

            <SheetSection title="2. What is measured?">
                <div className={styles.pills} role="group" aria-label="Measured property">
                    {selection.measuredOptions.map((id) => (
                        <button
                            key={id}
                            type="button"
                            className={styles.pill}
                            aria-pressed={id === selection.measured}
                            onClick={() =>
                                writeQuery({ ...current, measured: id, from: null }, carried)
                            }
                        >
                            {model.label(id)}
                        </button>
                    ))}
                </div>
                <p className={styles.note}>
                    The measured properties datasets use with {classLabel}.
                </p>
            </SheetSection>

            <SheetSection title="3. Which properties split the figures?">
                <p className={styles.note}>
                    {count(selection.properties.length)} of{' '}
                    {plural(selection.splitOptions.length, 'property', 'properties')} ticked. Each
                    ticked property becomes a column. The datasets that use each are listed on the
                    right.
                </p>
                {inUse.length > 0 && <div className={styles.checks}>{inUse.map(box)}</div>}
                {unused.length > 0 && (
                    <MoreProperties
                        key={selection.classId}
                        unused={unused}
                        ticked={ticked}
                        classLabel={classLabel}
                        box={box}
                    />
                )}
            </SheetSection>

            <SheetSection title="4. Your sheet">
                <Closest selection={selection} />
                <Preview sheet={sheet} />
                <p className={styles.note}>
                    The three rows are examples. Replace them with the source&rsquo;s own codes and
                    labels. Each property column takes a value from its value list.
                </p>
                <div className={styles.exports}>
                    <CreateGoogleSheet
                        sheet={sheet}
                        query={sheetQuery(current, NO_CARRIED)}
                        memory={createMemory}
                        onMemory={setCreateMemory}
                    />
                    <DownloadCsv sheet={sheet} />
                </div>
                <ValueLists sheet={sheet} />
            </SheetSection>
        </>
    );
};

/**
 * Start a sheet: the columns a new dataset's mapping sheet needs and what goes
 * in them. The choices live in the URL query, so a sheet can be shared and
 * reloaded. The model is the one the section's layout loaded.
 */
const NewSheet = () => {
    const data = useExplorerData();
    const params = useSearchParams();
    // The return address's consent trip counts once. It is read on mount, and
    // its parameters leave the address at once.
    const [trip] = useState(() => takeConsentTrip(params.toString()).trip);
    useEffect(() => {
        const { query } = takeConsentTrip(window.location.search);
        if (query === window.location.search) return;
        window.history.replaceState(
            null,
            '',
            `${window.location.pathname}${query}${window.location.hash}`,
        );
    }, []);
    const model = data.model.status === 'ready' ? data.model.value : null;

    return (
        <ModelProvider value={model}>
            <div className={shell.explorer}>
                <TopBar />
                <main className={shell.main}>
                    <div className={styles.page}>
                        <header className={styles.header}>
                            <p className={styles.label}>Mapping sheets</p>
                            <h1 className={styles.title}>Start a sheet</h1>
                            <p className={styles.lead}>
                                Choose what a new dataset&rsquo;s figures are about, what they
                                measure and how they are split. The sheet has one column per
                                property, and each column takes values the graph already holds.
                            </p>
                        </header>
                        {data.model.status === 'ready' ? (
                            <SheetSteps trip={trip} />
                        ) : (
                            <LoadStatus state={data.model} onRetry={data.retryModel} />
                        )}
                    </div>
                </main>
            </div>
        </ModelProvider>
    );
};

export default NewSheet;
