'use client';

import classNames from 'classnames';
import { type ReactNode, useEffect, useState } from 'react';

import { useCopied } from '../hooks/useCopied';
import CardDownload from './CardDownload';
import styles from './CardInfoPanel.module.scss';

import Icon from '@/components/atoms/Icon/Icon';
import SourceCodes from '@/components/atoms/SourceCodes/SourceCodes';
import SourceLink from '@/components/atoms/SourceLink/SourceLink';
import HoverPopup from '@/components/molecules/HoverPopup/HoverPopup';
import Modal from '@/components/molecules/Modal/Modal';
import type { CardInfo, Widget } from '@/lib/chat/widgets';
import { sourceCodeText } from '@/lib/sourceCodes';
import type { SharedCardAddress } from '@/lib/studio/cardDownload';
import {
    type DescribedView,
    type LegacyView,
    localDay,
    type PanelBlock,
    type PanelCite,
    type PanelMade,
    type PanelRow,
    type PanelSource,
    type PanelStep,
    type PanelTerm,
} from '@/lib/studio/descriptionBlocks';
import { panelViewOf } from '@/lib/studio/infoPanel';

type SourceDoc = { name: string | null; description: string | null; url: string | null };

// The dcid the graph knows this source by is machine-shaped
// ("WorldDevelopmentIndicators"); its own documentation has the real name
// and a sentence about it.
const useSourceDoc = (dcid: string | null | undefined): SourceDoc | null => {
    // Keyed by the source it was fetched for, so switching cards shows
    // nothing rather than the previous card's source.
    const [fetched, setFetched] = useState<{ dcid: string; doc: SourceDoc } | null>(null);

    useEffect(() => {
        if (!dcid) {
            return;
        }

        let live = true;

        fetch(`/api/source-doc/${dcid}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((body: SourceDoc | null) => {
                if (live && body) {
                    setFetched({ dcid, doc: body });
                }
            })
            .catch(() => {});

        return () => {
            live = false;
        };
    }, [dcid]);

    return fetched && fetched.dcid === dcid ? fetched.doc : null;
};

// Copies `value`, and shows a tick for a moment after.
const CopyButton = ({ value, label }: { value: string; label: string }) => {
    const { copied, copy } = useCopied();

    return (
        <button
            type="button"
            className={styles.idCopy}
            aria-label={copied ? 'Copied' : label}
            onClick={() => copy(value)}
        >
            <Icon name={copied ? 'check' : 'copy'} />
        </button>
    );
};

const CopyId = ({ value }: { value: string }) => (
    <span className={styles.id}>
        <span className={styles.idValue} title={value}>
            {value}
        </span>
        <CopyButton value={value} label="Copy indicator id" />
    </span>
);

// One source the card cites, linked to its outside page or its page on this
// site, then its licence and what else is known of it. A legacy source
// (`lookup`) takes the graph's own name and link from its documentation once
// the panel opens; a described source already holds both.
const SourceEntry = ({ source, open }: { source: PanelSource; open: boolean }) => {
    const doc = useSourceDoc(open ? source.lookup : null);
    const url = source.url ?? doc?.url ?? null;
    const name = doc?.name ?? source.name;

    return (
        <li className={styles.source}>
            {url ? (
                <a className={styles.sourceName} href={url} target="_blank" rel="noreferrer">
                    {name}
                    <Icon name="arrow-up-right" className={styles.sourceIcon} />
                </a>
            ) : source.page ? (
                <SourceLink className={styles.sourceName} dcid={source.page}>
                    {name}
                </SourceLink>
            ) : (
                <p className={styles.sourceName}>{name}</p>
            )}
            {source.meta && <p className={styles.sourceMeta}>{source.meta}</p>}
        </li>
    );
};

// One block of the legacy panel, with its label, its rows of a label and a
// value, then its sentences.
const InfoBlock = ({ block }: { block: PanelBlock }) => (
    <div className={styles.block} data-block={block.key}>
        {block.label && <p className={styles.fieldLabel}>{block.label}</p>}
        {block.rows.length > 0 && <Rows rows={block.rows} />}
        {block.items.length > 0 && <Items items={block.items} />}
    </div>
);

const Rows = ({ rows }: { rows: PanelRow[] }) => (
    <dl className={styles.rows}>
        {rows.map((row, index) => (
            <div key={`${row.label}#${index}`} className={styles.row}>
                <dt className={styles.label}>{row.label}</dt>
                <dd className={styles.value}>{row.value}</dd>
            </div>
        ))}
    </dl>
);

const Items = ({ items }: { items: string[] }) => (
    <ul className={styles.items}>
        {items.map((item, index) => (
            <li key={`${item}#${index}`}>{item}</li>
        ))}
    </ul>
);

// The publisher's codes for the series holding a value the card shows,
// beside its name, with the sentence Get Data says them in as their title.
const TermCodes = ({ codes }: { codes: NonNullable<PanelTerm['codes']> }) => (
    <span className={styles.termCodes} title={sourceCodeText(codes)}>
        {codes.publishers.flatMap((publisher) =>
            publisher.codes.map((code) => <code key={code}>{code}</code>),
        )}
    </span>
);

// A value the card shows or is fixed to, by name. One with a definition
// opens it in the house popup, on hover, click, tap or the keyboard.
const TermName = ({ term }: { term: PanelTerm }) =>
    term.definition ? (
        <HoverPopup
            label={term.name}
            triggerClassName={styles.term}
            contentClassName={styles.definition}
            trigger={
                <>
                    {term.name}
                    <Icon name="info" className={styles.termIcon} />
                </>
            }
        >
            {term.definition}
        </HoverPopup>
    ) : (
        <span className={styles.termPlain}>{term.name}</span>
    );

const Term = ({ term }: { term: PanelTerm }) => (
    <>
        <TermName term={term} />
        {term.codes && <TermCodes codes={term.codes} />}
    </>
);

// What a failed snapshot link says, by why it failed.
const CITE_LINK_TEXT = {
    failed: 'Could not make a link. Try again.',
    limited: "This network has made today's links. Try again tomorrow.",
} as const;

type CiteForm = 'short' | 'full';

const CITE_FORMS: Record<CiteForm, { label: string; copy: string }> = {
    short: { label: 'Short', copy: 'Copy short citation' },
    full: { label: 'Reference list', copy: 'Copy full citation' },
};

// The citation in one form at a time, with a switch between them, then the
// owner's offer to create a public snapshot link and what came of it: the
// link (`madeLink`), or why there is none.
const CiteBlock = ({
    cite,
    link,
    madeLink,
    onAddLink,
}: {
    cite: PanelCite;
    link: CiteLinkState;
    madeLink: string | null;
    onAddLink: (() => void) | null;
}) => {
    const [form, setForm] = useState<CiteForm>('short');
    const text = cite[form];

    return (
        <div className={styles.cite} data-block="cite">
            <div className={styles.citeHead}>
                <p className={styles.fieldLabel}>Cite as</p>
                <span className={styles.citeSwitch} role="group" aria-label="Citation form">
                    {(['short', 'full'] as const).map((entry) => (
                        <button
                            key={entry}
                            type="button"
                            aria-pressed={entry === form}
                            onClick={() => setForm(entry)}
                        >
                            {CITE_FORMS[entry].label}
                        </button>
                    ))}
                </span>
            </div>
            <span className={styles.citeRow}>
                <span className={styles.citationText}>{text}</span>
                <CopyButton value={text} label={CITE_FORMS[form].copy} />
            </span>
            {cite.offer && onAddLink && link !== 'limited' && (
                <p className={styles.hint}>
                    {cite.offer.note && <>{cite.offer.note} </>}
                    <button
                        type="button"
                        className={styles.addLink}
                        disabled={link === 'minting'}
                        onClick={onAddLink}
                    >
                        {link === 'minting'
                            ? 'Creating a public link…'
                            : 'Create a public link to cite'}
                    </button>
                </p>
            )}
            {madeLink && (
                <p className={styles.hint} role="status">
                    Public snapshot link added:{' '}
                    <a
                        className={styles.madeLinkUrl}
                        href={madeLink}
                        target="_blank"
                        rel="noreferrer"
                    >
                        {madeLink}
                    </a>
                </p>
            )}
            {(link === 'failed' || link === 'limited') && (
                <p className={styles.hint} role="alert">
                    {CITE_LINK_TEXT[link]}
                </p>
            )}
        </div>
    );
};

// One step on the rail: its verb and object, and the step's sentence one
// click away. The step that draws the card has a filled dot.
const StepRow = ({ step }: { step: PanelStep }) => {
    const [open, setOpen] = useState(false);
    const label = (
        <span className={styles.stepLabel}>
            {step.givesCard && <span className={styles.stepKind}>Gives the card</span>}
            {step.verb ? (
                <>
                    <b>{step.verb}</b>
                    <i className={styles.stepDot}>·</i>
                    {step.object}
                </>
            ) : (
                step.object
            )}
        </span>
    );

    return (
        <li className={classNames(styles.step, step.givesCard && styles.stepCard)}>
            {step.detail ? (
                <button
                    type="button"
                    className={styles.stepRow}
                    aria-expanded={open}
                    onClick={() => setOpen((was) => !was)}
                >
                    {label}
                    <Icon
                        name="chevron-down"
                        className={classNames(styles.stepChevron, open && styles.stepChevronOpen)}
                    />
                </button>
            ) : (
                <span className={styles.stepRow}>{label}</span>
            )}
            {step.detail && open && <p className={styles.stepDetail}>{step.detail}</p>}
        </li>
    );
};

const MadeBlock = ({ made }: { made: PanelMade }) => (
    <details className={styles.indicator} data-block="made">
        <summary className={styles.indicatorHead}>
            <span className={styles.indicatorName}>How this card was made</span>
            <Icon name="chevron-down" className={styles.indicatorChevron} />
        </summary>
        <div className={styles.made}>
            {made.steps.length > 0 && (
                <ol className={styles.rail}>
                    {made.steps.map((step) => (
                        <StepRow key={step.key} step={step} />
                    ))}
                </ol>
            )}
            {made.notes.length > 0 && <Items items={made.notes} />}
            {made.pages.map((page) => (
                <SourceLink key={page.key} className={styles.madeLink} dcid={page.page}>
                    {page.name}
                    <Icon name="arrow-up-right" className={styles.madeLinkIcon} />
                </SourceLink>
            ))}
        </div>
    </details>
);

// A described card's panel holds, in order, what a quotient or share card
// divides by what, what the card shows and what its measure means, what to
// keep in mind, its sources (with a computed card's inputs when no
// calculation names them), how to cite it, its download, then how it was
// made, collapsed.
const DescribedPanel = ({
    view,
    download,
    link,
    onAddLink,
}: {
    view: DescribedView;
    download: ReactNode;
    link: CiteLinkState;
    onAddLink: (() => void) | null;
}) => (
    <div className={styles.panel}>
        <p className={styles.title}>{view.title}</p>
        {view.live && <p className={styles.live}>{view.live}</p>}
        {view.calculation && (
            <div className={styles.formula} data-block="calculation">
                <p className={styles.formulaLabel}>Calculated as</p>
                <div className={styles.fraction}>
                    <p>{view.calculation.numerator}</p>
                    <hr />
                    <p>{view.calculation.denominator}</p>
                </div>
            </div>
        )}
        {view.measure && (
            <p className={styles.measure}>
                <b>{view.measure.label}</b>. {view.measure.definition}
            </p>
        )}
        {view.codes && <SourceCodes codes={view.codes} className={styles.codes} />}

        <div>
            {view.rows.length > 0 && <Rows rows={view.rows} />}
            {view.terms.map((list) => (
                <div key={list.key} className={styles.termBlock} data-block={list.key}>
                    <p className={styles.label}>{list.label}</p>
                    <ul className={styles.terms}>
                        {list.terms.map((term) => (
                            <li key={term.key}>
                                <Term term={term} />
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>

        {view.keepInMind.length > 0 && (
            <div className={styles.block} data-block="keep">
                <p className={styles.fieldLabel}>Keep in mind</p>
                <Items items={view.keepInMind} />
            </div>
        )}

        {(view.sources.length > 0 || view.inputs.length > 0) && (
            <div className={styles.block} data-block="sources">
                {view.sources.length > 0 && (
                    <>
                        <p className={styles.fieldLabel}>
                            {view.sources.length > 1 ? 'Sources' : 'Source'}
                        </p>
                        <ul className={styles.sources}>
                            {/* A described source holds its name and page, so there is nothing to look up. */}
                            {view.sources.map((source) => (
                                <SourceEntry key={source.key} source={source} open={false} />
                            ))}
                        </ul>
                    </>
                )}
                {view.inputs.length > 0 && (
                    <>
                        <p className={styles.fieldLabel}>Calculated from</p>
                        <Items items={view.inputs} />
                    </>
                )}
                {view.from && <p className={styles.from}>{view.from}</p>}
            </div>
        )}

        <CiteBlock
            cite={view.cite}
            link={link}
            madeLink={typeof link === 'object' ? snapshotUrlOf(link.id) : null}
            onAddLink={onAddLink}
        />

        {download}

        {view.made && <MadeBlock made={view.made} />}
    </div>
);

// A card without a description shows the citation, every source, the years,
// indicator count, unit and freshness, what the card's data leaves out, then
// each indicator with its id and description.
const LegacyPanel = ({
    view,
    open,
    download,
}: {
    view: LegacyView;
    open: boolean;
    download: ReactNode;
}) => (
    <div className={styles.panel}>
        {view.citation && (
            <div className={styles.citation}>
                <p className={styles.fieldLabel}>Cite as</p>
                <span className={styles.id}>
                    <span className={styles.citationText}>{view.citation}</span>
                    <CopyButton value={view.citation} label="Copy citation" />
                </span>
            </div>
        )}

        {view.sources.length > 0 && (
            <ul className={styles.sources}>
                {view.sources.map((source) => (
                    <SourceEntry key={source.key} source={source} open={open} />
                ))}
            </ul>
        )}

        {view.blocks.map((block) => (
            <InfoBlock key={block.key} block={block} />
        ))}

        {download}

        {view.indicators.map((indicator, index) => (
            <details key={indicator.key} className={styles.indicator} open={index === 0}>
                <summary className={styles.indicatorHead}>
                    <span className={styles.indicatorName}>{indicator.name}</span>
                    <Icon name="chevron-down" className={styles.indicatorChevron} />
                </summary>
                <div className={styles.indicatorBody}>
                    {indicator.id && (
                        <>
                            <p className={styles.fieldLabel}>ID</p>
                            <CopyId value={indicator.id} />
                        </>
                    )}
                    {indicator.description && (
                        <>
                            <p className={styles.fieldLabel}>Description</p>
                            <p className={styles.description}>{indicator.description}</p>
                        </>
                    )}
                </div>
            </details>
        ))}
    </div>
);

/** The snapshot share a card is cited from: its id, and when the card's
 *  slot began to show the data it shows, an ISO timestamp. */
export type CitedSnapshot = { id: string; servedAt?: string };

// Where asking for a snapshot link to cite the card stands: being made, or
// refused.
export type CiteAsk = 'minting' | 'failed' | 'limited';

// Where the owner's snapshot link for the citation stands: none asked for,
// asked for (`CiteAsk`), or made (`CitedSnapshot`).
type CiteLinkState = 'idle' | CiteAsk | CitedSnapshot;

// The link a snapshot share is cited by, read in the browser, where the
// panel opens.
const snapshotUrlOf = (shareId: string | undefined): string | null =>
    shareId && typeof window !== 'undefined'
        ? `${window.location.origin}/s/${encodeURIComponent(shareId)}`
        : null;

// The day a snapshot card's data dates from, in the reader's time zone:
// when its slot began to show it. Null when the share's history does not
// say, so the citation gives no date. The day the share was made is no
// stand-in: a live share made a snapshot later serves newer data.
const snapshotAsOfOf = (snapshot: CitedSnapshot | undefined): string | null => {
    const at = snapshot?.servedAt;
    const moment = at ? new Date(at) : null;

    return moment && !Number.isNaN(moment.getTime()) ? localDay(moment) : null;
};

/**
 * More Info, the back of the card. A card that carries a description shows
 * it as `DescribedPanel` lays it out, with no request. A card without one
 * shows the legacy panel. Download Data sits after the citation either way.
 * On a share whose slot draws the card (`shared`) it serves the rows that
 * slot serves. The card's
 * owner (`canShare`) can add a snapshot link to the citation, which
 * `onCiteLink` asks for and `citeLink` reports: being made, refused or made.
 * The caller keeps it, so the card keeps one link, and one request for it,
 * however often the panel opens on it. The full citation is retrieved
 * today. On a snapshot share (`snapshot`) it names the share's link and the
 * day the card's data dates from.
 */
const CardInfoPanel = ({
    info,
    widget,
    open,
    onOpenChange,
    shared,
    snapshot,
    canShare = false,
    citeLink,
    onCiteLink,
}: {
    info: CardInfo | null;
    // The card itself, for Download Data.
    widget: Widget | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    shared?: SharedCardAddress | null;
    // The snapshot share the card is shown on.
    snapshot?: CitedSnapshot;
    canShare?: boolean;
    // Where the snapshot link to cite the card stands, when it was asked for.
    citeLink?: CitedSnapshot | CiteAsk;
    // Asks for a snapshot of the card for its citation, whose progress and
    // link come back as `citeLink`.
    onCiteLink?: () => void;
}) => {
    const link: CiteLinkState = citeLink ?? 'idle';
    const cited = snapshot ?? (typeof citeLink === 'object' ? citeLink : undefined);
    const view =
        info &&
        panelViewOf(info, {
            retrievedOn: localDay(new Date()),
            snapshotUrl: snapshotUrlOf(cited?.id),
            snapshotAsOf: snapshotAsOfOf(cited),
            canShare,
        });
    const download = widget && <CardDownload widget={widget} shared={shared} />;

    return (
        <Modal open={open && view !== null} onOpenChange={onOpenChange} title="More Info">
            {view?.kind === 'described' && (
                <DescribedPanel
                    view={view}
                    download={download}
                    link={link}
                    onAddLink={onCiteLink && widget ? onCiteLink : null}
                />
            )}
            {view?.kind === 'legacy' && <LegacyPanel view={view} open={open} download={download} />}
        </Modal>
    );
};

export default CardInfoPanel;
