'use client';

import classNames from 'classnames';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { downloadCsv } from './downloadCsv';
import { useCarried, useModel } from './ExploreContext';
import { BaseTag, TermLink } from './ExploreLink';
import FocusEntry, { useLens } from './FocusEntry';
import styles from './FocusPanel.module.scss';
import ValueTree from './ValueTree';

import Button from '@/components/atoms/Button/Button';
import { count, ofMembers, plural, valueListLabel } from '@/lib/graphExplorer/counts';
import {
    declaredDomain,
    openEntries,
    outsideKind,
    periodText,
    sharePercent,
    type FocusBox,
} from '@/lib/graphExplorer/focus';
import { declarerWords, KIND_WORDS, type DatasetView } from '@/lib/graphExplorer/model';
import { sheetHref } from '@/lib/graphExplorer/newSheet';
import { patternSentence } from '@/lib/graphExplorer/sentence';
import { valueListFileName, valueListTable } from '@/lib/graphExplorer/tables';
import type { SchemaFacets, SchemaTerm } from '@/lib/graphExplorer/wire';

const DATA_COMMONS_BROWSER = 'https://datacommons.org/browser/';

/** The dataset filter as the panel reads it: one chosen dataset, or none. */
export type PanelLens = { readonly dataset: string | null; readonly label: string | null };

const Label = ({ children }: { children: React.ReactNode }) => (
    <p className={styles.label}>{children}</p>
);

/** The dcid in mono with a Copy control, and the code where the term has one. */
const IdLine = ({ id, codes = [] }: { id: string; codes?: readonly string[] }) => {
    const [copied, setCopied] = useState<'done' | 'blocked' | null>(null);

    const copy = () => {
        navigator.clipboard.writeText(id).then(
            () => setCopied('done'),
            () => setCopied('blocked'),
        );
    };

    return (
        <div className={styles.idLine}>
            <span className={styles.mono}>{id}</span>
            {codes.length > 0 && (
                <span className={styles.code}>
                    {codes.length === 1 ? 'Code' : 'Codes'} {codes.join(', ')}
                </span>
            )}
            <Button small onClick={copy}>
                Copy
            </Button>
            <span className={styles.status} role="status">
                {copied === 'done'
                    ? 'Copied.'
                    : copied === 'blocked'
                      ? 'Copying is blocked here.'
                      : ''}
            </span>
        </div>
    );
};

/** A link to the sheet page, styled as an action. Prefetch is off for the dynamic page. */
const SheetLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <Link href={href} prefetch={false} className={styles.action}>
        {children}
    </Link>
);

/** One bar per dataset: how many of its StatVars use the term, against its total. */
const UsageBars = ({ id, lens }: { id: string; lens: PanelLens }) => {
    const model = useModel();
    const { byDataset } = model.usage(id);

    return (
        <section className={styles.section}>
            <Label>StatVars that use it</Label>
            {byDataset.length === 0 ? (
                <p className={styles.note}>No StatVar in the datasets uses it.</p>
            ) : (
                <ul className={styles.uses}>
                    {byDataset.map(({ dataset, count: n }) => {
                        const percent = sharePercent(
                            n,
                            model.dataset(dataset)?.stat_var_count ?? n,
                        );
                        return (
                            <li
                                key={dataset}
                                className={classNames(
                                    styles.use,
                                    lens.dataset !== null && lens.dataset !== dataset && styles.dim,
                                )}
                            >
                                <TermLink id={dataset} />
                                <span className={styles.mono}>{count(n)}</span>
                                <span
                                    className={styles.bar}
                                    role="img"
                                    aria-label={`${percent}% of its StatVars`}
                                >
                                    <i style={{ width: `${Math.max(1, percent)}%` }} />
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
};

/**
 * One bar per dataset that uses a value list's members: how many of them,
 * against the list's size. A StatVar names the members, so the list's use is
 * read from them, as the dataset filter reads it.
 */
const MemberBars = ({ id, lens }: { id: string; lens: PanelLens }) => {
    const model = useModel();
    const uses = model.memberUse(id);

    return (
        <section className={styles.section}>
            <Label>Datasets that use its values</Label>
            {uses.length === 0 ? (
                <p className={styles.note}>No dataset uses its values.</p>
            ) : (
                <ul className={styles.uses}>
                    {uses.map(({ dataset, values }) => {
                        const percent = sharePercent(values.used, values.of);
                        return (
                            <li
                                key={dataset}
                                className={classNames(
                                    styles.use,
                                    lens.dataset !== null && lens.dataset !== dataset && styles.dim,
                                )}
                            >
                                <TermLink id={dataset} />
                                <span className={styles.mono}>{ofMembers(values)}</span>
                                <span
                                    className={styles.bar}
                                    role="img"
                                    aria-label={`${percent}% of its values`}
                                >
                                    <i style={{ width: `${Math.max(1, percent)}%` }} />
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
};

/** A node's open properties, each a line beside the named fields: links to nodes the model holds, the rest as text. */
const OpenLines = ({ id }: { id: string }) => {
    const model = useModel();

    return openEntries(model, id).map(({ property, label, values }) => (
        <p key={property} className={styles.line}>
            {label}:{' '}
            {values.map((value, index) => (
                <span key={value.kind === 'node' ? value.id : `${index}:${value.text}`}>
                    {index > 0 && ', '}
                    {value.kind === 'node' ? (
                        <TermLink id={value.id} />
                    ) : (
                        <span className={styles.mono}>{value.text}</span>
                    )}
                </span>
            ))}
        </p>
    ));
};

/** A term the model holds: what it is, its names, its definition, its source and its use. */
export const NodePanel = ({ id, lens }: { id: string; lens: PanelLens }) => {
    const model = useModel();
    const carried = useCarried();
    const node = model.node(id);
    const kind = model.kind(id);
    if (!node || !kind) return null;

    const list = kind === 'value' ? model.valueListOf(id) : undefined;
    const domain = kind === 'property' ? declaredDomain(model, id) : null;
    const hasList = model.hasValueList(id);
    const members = hasList ? model.members(id).length : 0;
    const complete = hasList && model.membersComplete(id);
    const used = hasList && lens.dataset !== null ? model.lens(lens.dataset, [id])[0] : undefined;

    return (
        <>
            <div className={styles.section}>
                <Label>
                    {KIND_WORDS[kind]}
                    {list !== undefined && (
                        <>
                            {' in '}
                            <TermLink id={list} />
                        </>
                    )}
                </Label>
                <h2 className={styles.name}>{model.label(id)}</h2>
                <IdLine id={id} codes={node.classification_code} />
            </div>
            <p className={classNames(!node.description && styles.note)}>
                {node.description ?? 'No definition on the graph.'}
            </p>
            {node.alternate_name.length > 0 && (
                <p className={styles.note}>Also called {node.alternate_name.join(', ')}.</p>
            )}
            {node.declared_by !== null && (
                <p className={styles.line}>
                    Declared by {declarerWords(node.declared_by)} in{' '}
                    <span className={styles.mono}>
                        {node.provenances.join(', ') || 'no source'}
                    </span>
                </p>
            )}
            {domain && (
                <p className={styles.line}>
                    Declared for{' '}
                    {domain.map((classId, index) => (
                        <span key={classId}>
                            {index > 0 && ', '}
                            <TermLink id={classId} />
                        </span>
                    ))}
                    .
                </p>
            )}
            <OpenLines id={id} />
            {hasList && (members > 0 || !complete) && (
                <section className={styles.section}>
                    <Label>
                        {valueListLabel(
                            members,
                            complete,
                            used?.members && lens.label !== null
                                ? { user: lens.label, values: used.members }
                                : null,
                        )}
                    </Label>
                    <ValueTree listId={id} lensDataset={lens.dataset} />
                    <div>
                        <Button
                            small
                            onClick={() =>
                                downloadCsv(valueListTable(model, id), valueListFileName(model, id))
                            }
                        >
                            Download CSV
                        </Button>
                    </div>
                </section>
            )}
            {kind !== 'valueList' && <UsageBars id={id} lens={lens} />}
            {hasList && <MemberBars id={id} lens={lens} />}
            {kind === 'class' && (
                <div>
                    <SheetLink href={sheetHref({ classId: id }, carried)}>
                        Start a Sheet for This Class
                    </SheetLink>
                </div>
            )}
        </>
    );
};

const FACETS: { key: keyof SchemaFacets; label: string; text?: (code: string) => string }[] = [
    { key: 'units', label: 'Units' },
    { key: 'observation_periods', label: 'Periods', text: periodText },
    { key: 'measurement_methods', label: 'Methods' },
    { key: 'currencies', label: 'Currencies' },
    { key: 'scaling_factors', label: 'Scaling factors' },
];

/** A dataset: its description, its StatVar count, its patterns as sentences and its facet facts. */
export const DatasetPanel = ({ view }: { view: DatasetView }) => {
    const model = useModel();
    const carried = useCarried();
    const facets = model.dataset(view.id)?.facets;

    return (
        <>
            <div className={styles.section}>
                <Label>Dataset</Label>
                <h2 className={styles.name}>{view.label}</h2>
                <IdLine id={view.id} />
            </div>
            <p className={classNames(!view.description && styles.note)}>
                {view.description ?? 'No description on the graph.'}
            </p>
            <p className={styles.line}>{plural(view.statVarCount, 'StatVar')}</p>
            <section className={styles.section}>
                <Label>How its StatVars are formed</Label>
                <ol className={styles.patterns}>
                    {view.patterns.map((pattern, index) => (
                        // Patterns have no id. Their order is the document's and does not change.
                        <li key={index} className={styles.pattern}>
                            <p className={styles.sentence}>
                                {patternSentence(model, pattern).map((part, at) =>
                                    part.kind === 'term' ? (
                                        <TermLink key={at} id={part.id} />
                                    ) : (
                                        <span key={at}>{part.text}</span>
                                    ),
                                )}
                            </p>
                            <p className={styles.meta}>
                                {plural(pattern.stat_var_count, 'StatVar')}
                                {view.statVarCount > 0 &&
                                    `, ${sharePercent(pattern.stat_var_count, view.statVarCount)}%`}
                            </p>
                            {pattern.examples[0] !== undefined && (
                                <p className={styles.meta}>
                                    For example{' '}
                                    <span className={styles.mono}>{pattern.examples[0]}</span>
                                </p>
                            )}
                            <div>
                                <SheetLink
                                    href={sheetHref({ from: { dataset: view.id, index } }, carried)}
                                >
                                    Start a Sheet Like This
                                </SheetLink>
                            </div>
                        </li>
                    ))}
                </ol>
            </section>
            {facets && (
                <section className={styles.section}>
                    <Label>Series facts</Label>
                    {FACETS.filter(({ key }) => facets[key].length > 0).map(
                        ({ key, label, text = (code) => code }) => (
                            <p key={key} className={styles.line}>
                                {label}:{' '}
                                <span className={styles.mono}>
                                    {facets[key].map(text).join(', ')}
                                </span>
                            </p>
                        ),
                    )}
                </section>
            )}
        </>
    );
};

/**
 * A term the DFO model does not hold, such as a base Data Commons term
 * reached from search: its name, the base tag and a link to the graph's browser.
 */
export const OutsidePanel = ({ id, term }: { id: string; term: SchemaTerm | undefined }) => (
    <>
        <div className={styles.section}>
            <Label>{outsideKind(term)}</Label>
            <h2 className={styles.name}>
                {term?.label ?? id}
                {term?.declared_by === 'base' && (
                    <>
                        {' '}
                        <BaseTag />
                    </>
                )}
            </h2>
            <IdLine id={id} />
        </div>
        <p>The DFO model does not use it, so no dataset here draws on it.</p>
        <p className={styles.line}>
            <a
                className={styles.external}
                href={`${DATA_COMMONS_BROWSER}${encodeURIComponent(id)}`}
                target="_blank"
                rel="noopener noreferrer"
            >
                Open in the Data Commons browser
            </a>
        </p>
    </>
);

type FullListProps = {
    box: FocusBox;
    lens: PanelLens;
    onClose: () => void;
};

/** Every entry of one box of the picture, with a way back to the definition. */
export const FullList = ({ box, lens, onClose }: FullListProps) => {
    const entries = useLens(lens.dataset, box.ids);
    const heading = useRef<HTMLHeadingElement>(null);

    useEffect(() => heading.current?.focus({ preventScroll: true }), []);

    return (
        <section className={styles.section}>
            <h2 className={styles.name} tabIndex={-1} ref={heading}>
                {box.title} <span className={styles.total}>({count(box.ids.length)})</span>
            </h2>
            <ul className={styles.full}>
                {box.ids.map((id) => (
                    <FocusEntry
                        key={id}
                        id={id}
                        lens={entries?.get(id) ?? null}
                        datasetLabel={lens.label}
                        values={box.values?.get(id) ?? null}
                    />
                ))}
            </ul>
            <div>
                <Button onClick={onClose}>Back to Definition</Button>
            </div>
        </section>
    );
};
