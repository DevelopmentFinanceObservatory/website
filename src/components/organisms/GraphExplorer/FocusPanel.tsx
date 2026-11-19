'use client';

import classNames from 'classnames';
import Link from 'next/link';
import { Fragment, useEffect, useId, useRef, useState } from 'react';

import { BreakableId } from './BreakableId';
import { downloadCsv } from './downloadCsv';
import { useCarried, useModel } from './ExploreContext';
import { OriginTag, TermLink } from './ExploreLink';
import FocusEntry, { useLens } from './FocusEntry';
import styles from './FocusPanel.module.scss';
import { GapNote } from './GapNote';
import { ListToggle, useListOrigins, useTermSources, type ListOrigins } from './ListToggle';
import ValueTree from './ValueTree';

import Button from '@/components/atoms/Button/Button';
import { count, ofMembers, plural, valueListLabel } from '@/lib/graphExplorer/counts';
import {
    centreHeading,
    declaredDomain,
    openEntries,
    periodText,
    sharePercent,
    type FocusBox,
} from '@/lib/graphExplorer/focus';
import { datasetHead } from '@/lib/graphExplorer/lists';
import { declarerWords, kindWords, patternId, type DatasetView } from '@/lib/graphExplorer/model';
import {
    leftOutLine,
    leftOutProperties,
    openLineCut,
    type Completeness,
    type ListGap,
} from '@/lib/graphExplorer/nodeView';
import { seedHref } from '@/lib/graphExplorer/seed';
import { patternSentence } from '@/lib/graphExplorer/sentence';
import { valueListFileName, valueListTable } from '@/lib/graphExplorer/tables';
import type { SchemaFacets } from '@/lib/graphExplorer/wire';

const DATA_COMMONS_BROWSER = 'https://datacommons.org/browser/';

/** The dataset filter as the panel reads it: one chosen dataset, or none. */
export type PanelLens = { readonly dataset: string | null; readonly label: string | null };

/** The origin tag of a dataset the model holds, from the usage document that lists it. */
const DatasetTag = ({ id, origins }: { id: string; origins: ListOrigins }) => {
    const dataset = useModel().dataset(id);
    return (
        <OriginTag declaredBy={dataset === undefined ? null : origins.dataset(dataset)} dataset />
    );
};

/** A dataset by its label, linking to its view, with the tag of the origin whose usage lists it. */
const DatasetName = ({ id, origins }: { id: string; origins: ListOrigins }) => (
    <span>
        <TermLink id={id} />
        <DatasetTag id={id} origins={origins} />
    </span>
);

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
            <span className={styles.mono}>
                <BreakableId text={id} />
            </span>
            {codes.length > 0 && (
                <span className={styles.code}>
                    {codes.length === 1 ? 'Code' : 'Codes'} <BreakableId text={codes.join(', ')} />
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

/** A link to the Seed a dataset page, styled as an action. Prefetch is off for the dynamic page. */
const SheetLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <Link href={href} prefetch={false} className={styles.action}>
        {children}
    </Link>
);

/** A link to the term's page in the base Data Commons browser. */
const BrowserLink = ({ id }: { id: string }) => (
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
);

/**
 * One bar per dataset: how many of its StatVars use the term, against its
 * total. The filtered dataset's bar stays on show past the first few.
 */
const UsageBars = ({ id, lens }: { id: string; lens: PanelLens }) => {
    const model = useModel();
    const origins = useListOrigins(model);
    const [open, setOpen] = useState(false);
    const listId = useId();
    const { byDataset } = model.usage(id);
    const head = datasetHead(byDataset, { open, dataset: lens.dataset });

    return (
        <section className={styles.section}>
            <Label>StatVars that use it</Label>
            {byDataset.length === 0 ? (
                <p className={styles.note}>No StatVar in the datasets uses it.</p>
            ) : (
                <ul id={listId} className={styles.uses}>
                    {head.shown.map(({ dataset, count: n }) => {
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
                                <DatasetName id={dataset} origins={origins} />
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
            <ListToggle
                head={head}
                noun="datasets"
                controls={listId}
                open={open}
                onToggle={() => setOpen((was) => !was)}
            />
        </section>
    );
};

/**
 * One bar per dataset that uses a value list's members: how many of them,
 * against the list's size. A StatVar names the members, so the list's use is
 * read from them, as the dataset filter reads it. The filtered dataset's bar
 * stays on show past the first few.
 */
const MemberBars = ({ id, lens }: { id: string; lens: PanelLens }) => {
    const model = useModel();
    const origins = useListOrigins(model);
    const [open, setOpen] = useState(false);
    const listId = useId();
    const uses = model.memberUse(id);
    const head = datasetHead(uses, { open, dataset: lens.dataset });

    return (
        <section className={styles.section}>
            <Label>Datasets that use its values</Label>
            {uses.length === 0 ? (
                <p className={styles.note}>No dataset uses its values.</p>
            ) : (
                <ul id={listId} className={styles.uses}>
                    {head.shown.map(({ dataset, values }) => {
                        const percent = sharePercent(values.used, values.of);
                        return (
                            <li
                                key={dataset}
                                className={classNames(
                                    styles.use,
                                    lens.dataset !== null && lens.dataset !== dataset && styles.dim,
                                )}
                            >
                                <DatasetName id={dataset} origins={origins} />
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
            <ListToggle
                head={head}
                noun="datasets"
                controls={listId}
                open={open}
                onToggle={() => setOpen((was) => !was)}
            />
        </section>
    );
};

/**
 * A node's open properties, each a line beside the named fields: links to
 * nodes the model holds, the rest as text. A line whose listing stopped at
 * its cap (openLineCut) says so beneath it.
 */
const OpenLines = ({ id, completeness }: { id: string; completeness: Completeness }) => {
    const model = useModel();

    return openEntries(model, id).map(({ property, label, values }) => (
        <Fragment key={property}>
            <p className={styles.line}>
                {label}:{' '}
                {values.map((value, index) => (
                    <span key={value.kind === 'node' ? value.id : `${index}:${value.text}`}>
                        {index > 0 && ', '}
                        {value.kind === 'node' ? (
                            <TermLink id={value.id} name={value.name} />
                        ) : (
                            <span className={styles.mono}>
                                <BreakableId text={value.text} />
                            </span>
                        )}
                    </span>
                ))}
            </p>
            {openLineCut(completeness, id, property) && (
                <GapNote gaps={['capped']} className={styles.note} />
            )}
        </Fragment>
    ));
};

/**
 * A term the model holds: what it is, its names, its definition, its source
 * and its use. A term the base Data Commons declares links to its browser
 * page. The UN System Data Commons serves no browser page.
 */
export const NodePanel = ({
    id,
    lens,
    completeness,
}: {
    id: string;
    lens: PanelLens;
    /**
     * How completely the model holds the term's links, for its open lines
     * (openLineCut) and the properties its view left out (leftOutProperties).
     */
    completeness: Completeness;
}) => {
    const model = useModel();
    const node = model.node(id);
    const kind = model.kind(id);
    if (!node || !kind) return null;

    const list = kind === 'value' ? model.valueListOf(id) : undefined;
    const domain = kind === 'property' ? declaredDomain(model, id) : null;
    const hasList = model.hasValueList(id);
    const members = hasList ? model.members(id).length : 0;
    const complete = hasList && model.membersComplete(id);
    const used = hasList && lens.dataset !== null ? model.lens(lens.dataset, [id])[0] : undefined;
    const leftOut = leftOutLine(
        leftOutProperties(completeness, node).map((property) => model.label(property)),
    );

    return (
        <>
            <div className={styles.section}>
                <Label>
                    {kindWords(model, kind, node.types)}
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
                        <BreakableId text={node.provenances.join(', ') || 'no source'} />
                    </span>
                </p>
            )}
            {node.declared_by === 'base' && <BrowserLink id={id} />}
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
            <OpenLines id={id} completeness={completeness} />
            {leftOut !== null && <p className={styles.note}>{leftOut}</p>}
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
    const origins = useListOrigins(model);
    const facets = model.dataset(view.id)?.facets;
    const facetLines = facets ? FACETS.filter(({ key }) => facets[key].length > 0) : [];

    return (
        <>
            <div className={styles.section}>
                <Label>Dataset</Label>
                <h2 className={styles.name}>
                    {view.label}
                    <DatasetTag id={view.id} origins={origins} />
                </h2>
                <IdLine id={view.id} />
            </div>
            <p className={classNames(!view.description && styles.note)}>
                {view.description ?? 'No description on the graph.'}
            </p>
            <p className={styles.line}>{plural(view.statVarCount, 'StatVar')}</p>
            <section className={styles.section}>
                <Label>How its StatVars are formed</Label>
                <ol className={styles.patterns}>
                    {view.patterns.map((pattern) => (
                        <li key={patternId(pattern)} className={styles.pattern}>
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
                                    <span className={styles.mono}>
                                        <BreakableId text={pattern.examples[0]} />
                                    </span>
                                </p>
                            )}
                        </li>
                    ))}
                </ol>
                {view.patterns.length > 0 && (
                    <div>
                        <SheetLink href={seedHref({ dataset: view.id }, carried)}>
                            Seed a Dataset Like This
                        </SheetLink>
                    </div>
                )}
            </section>
            {facets && facetLines.length > 0 && (
                <section className={styles.section}>
                    <Label>Series facts</Label>
                    {facetLines.map(({ key, label, text = (code) => code }) => (
                        <p key={key} className={styles.line}>
                            {label}:{' '}
                            <span className={styles.mono}>
                                <BreakableId text={facets[key].map(text).join(', ')} />
                            </span>
                        </p>
                    ))}
                </section>
            )}
        </>
    );
};

/**
 * A term the model knows only from the usage documents or a loaded terms
 * list, whose node view did not load: what its types say it is, its name
 * (else its dcid), and every dataset that uses it, with a link to the base
 * Data Commons browser. A term whose origin reads as the UN System Data
 * Commons (`termOrigin`, as its heading's tag reads it) gets none, since the
 * base browser does not hold it and the UN System Data Commons serves no
 * browser page (its /browser/ path answers 404).
 */
export const TermPanel = ({ id, lens }: { id: string; lens: PanelLens }) => {
    const model = useModel();
    const sources = useTermSources();
    const heading = centreHeading(model, { kind: 'node', id }, sources);

    return (
        <>
            <div className={styles.section}>
                <Label>{heading?.kind}</Label>
                <h2 className={styles.name}>{heading?.name ?? id}</h2>
                <IdLine id={id} />
            </div>
            <p className={styles.note}>Only its use in the datasets is known here.</p>
            {heading?.declaredBy !== 'un_system' && <BrowserLink id={id} />}
            <UsageBars id={id} lens={lens} />
        </>
    );
};

type FullListProps = {
    box: FocusBox;
    lens: PanelLens;
    /** What the box's listings leave out, as boxGaps reads them. */
    gaps: readonly ListGap[];
    onClose: () => void;
};

/** Every entry of one box of the picture, with what it may leave out and a way back to the definition. */
export const FullList = ({ box, lens, gaps, onClose }: FullListProps) => {
    const entries = useLens(lens.dataset, box.ids);
    const heading = useRef<HTMLHeadingElement>(null);

    useEffect(() => heading.current?.focus({ preventScroll: true }), []);

    return (
        <section className={styles.section}>
            <h2 className={styles.name} tabIndex={-1} ref={heading}>
                {box.title} <span className={styles.total}>({count(box.ids.length)})</span>
            </h2>
            <GapNote gaps={gaps} className={styles.note} />
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
