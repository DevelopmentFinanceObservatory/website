'use client';

import { useSearchParams } from 'next/navigation';
import { useId, useMemo } from 'react';

import styles from './NewSheet.module.scss';
import { CreateGoogleSheet, DownloadCsv } from './SheetExports';

import {
    ModelProvider,
    useCarried,
    useModel,
} from '@/components/organisms/GraphExplorer/ExploreContext';
import { TermLink } from '@/components/organisms/GraphExplorer/ExploreLink';
import { count, plural } from '@/components/organisms/GraphExplorer/format';
import shell from '@/components/organisms/GraphExplorer/GraphExplorer.module.scss';
import LoadStatus from '@/components/organisms/GraphExplorer/LoadStatus';
import TopBar from '@/components/organisms/GraphExplorer/TopBar';
import { useExplorerData } from '@/components/organisms/GraphExplorer/useExplorerData';
import type { Carried } from '@/lib/graphExplorer/explore';
import {
    queryOf,
    readSheetQuery,
    resolveSheet,
    sheetHref,
    type SheetQuery,
    type SheetSelection,
    type SplitOption,
} from '@/lib/graphExplorer/newSheet';
import { patternSentence } from '@/lib/graphExplorer/sentence';
import { closestPattern, sheetDraft, type SheetDraft } from '@/lib/graphExplorer/sheet';

/**
 * Replaces the page's query in place, keeping the carried parameters: the
 * URL holds the sheet, and the back button skips edits.
 */
const writeQuery = (query: SheetQuery, carried: Carried) =>
    window.history.replaceState(null, '', sheetHref(query, carried));

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
                {option.valueList !== null && (
                    <span className={styles.from}>
                        from {model.label(option.valueList)}, {plural(option.members, 'value')}
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
                The closest pattern is the one about this kind of thing that splits by the most of
                the ticked properties. A tie goes to the pattern with more StatVars.
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
            // The box scrolls sideways; a tab stop lets a keyboard scroll it.
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
                    <TermLink id={column.lookup?.valueList ?? ''} />{' '}
                    <span className={styles.size}>
                        ({plural(column.lookup?.members.length ?? 0, 'value')})
                    </span>
                </li>
            ))}
        </ul>
    );
};

/** The four steps, top to bottom, over the model and the URL's choices. */
const SheetSteps = () => {
    const model = useModel();
    const params = useSearchParams();
    const carried = useCarried();
    const selection = useMemo(() => resolveSheet(model, readSheetQuery(params)), [model, params]);
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
            <Section title="1. What are the figures about?">
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
            </Section>

            <Section title="2. What is measured?">
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
            </Section>

            <Section title="3. Which properties split the figures?">
                <p className={styles.note}>
                    {count(selection.properties.length)} of{' '}
                    {plural(selection.splitOptions.length, 'property', 'properties')} ticked. Each
                    ticked property becomes a column. The datasets that use each are listed on the
                    right.
                </p>
                {inUse.length > 0 && <div className={styles.checks}>{inUse.map(box)}</div>}
                {unused.length > 0 && (
                    <details className={styles.more} open={unused.some((o) => ticked.has(o.id))}>
                        <summary>
                            {plural(unused.length, 'more property', 'more properties')} declared for{' '}
                            {classLabel} that no dataset splits by yet
                        </summary>
                        <div className={styles.checks}>{unused.map(box)}</div>
                    </details>
                )}
            </Section>

            <Section title="4. Your sheet">
                <Closest selection={selection} />
                <Preview sheet={sheet} />
                <p className={styles.note}>
                    The three rows are examples: replace them with the source&rsquo;s own codes and
                    labels. Each property column takes a value from its value list.
                </p>
                <div className={styles.exports}>
                    <CreateGoogleSheet sheet={sheet} />
                    <DownloadCsv sheet={sheet} />
                </div>
                <ValueLists sheet={sheet} />
            </Section>
        </>
    );
};

/**
 * Start a sheet: the columns a new dataset's mapping sheet needs and what goes
 * in them. The choices live in the URL query, so a sheet can be shared and
 * reloaded; the model is the one the section's layout loaded.
 */
const NewSheet = () => {
    const data = useExplorerData();
    const model = data.model.status === 'ready' ? data.model.value : null;
    const { baseTerms } = data;

    return (
        <ModelProvider value={model}>
            <div className={shell.explorer}>
                <TopBar screen="new-sheet" model={model} baseTerms={baseTerms} />
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
                            <SheetSteps />
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
