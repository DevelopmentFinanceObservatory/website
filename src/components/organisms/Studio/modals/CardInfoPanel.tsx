'use client';

import { type ReactNode, useEffect, useState } from 'react';

import { useCopied } from '../hooks/useCopied';
import CardDownload from './CardDownload';
import styles from './CardInfoPanel.module.scss';

import Icon from '@/components/atoms/Icon/Icon';
import SourceLink from '@/components/atoms/SourceLink/SourceLink';
import HoverPopup from '@/components/molecules/HoverPopup/HoverPopup';
import Modal from '@/components/molecules/Modal/Modal';
import type { CardInfo, Widget } from '@/lib/chat/widgets';
import type { SharedCardAddress } from '@/lib/studio/cardDownload';
import {
    type DescribedView,
    type LegacyView,
    localDay,
    type PanelBlock,
    type PanelRow,
    type PanelSource,
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

// A value the card shows or is fixed to, by name. One with a definition
// opens it in the house popup, on hover, click, tap or the keyboard.
const Term = ({ term }: { term: PanelTerm }) =>
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

const CiteForm = ({ kind, text, label }: { kind: string; text: string; label: string }) => (
    <>
        <p className={styles.citeKind}>{kind}</p>
        <span className={styles.citeRow}>
            <span className={styles.citationText}>{text}</span>
            <CopyButton value={text} label={label} />
        </span>
    </>
);

// A described card's panel holds what it shows and what its measure means,
// what to keep in mind, its sources, how to cite it, its download, then how it
// was made, collapsed.
const DescribedPanel = ({ view, download }: { view: DescribedView; download: ReactNode }) => (
    <div className={styles.panel}>
        <p className={styles.title}>{view.title}</p>
        {view.live && <p className={styles.live}>{view.live}</p>}
        {view.measure && (
            <p className={styles.measure}>
                <b>{view.measure.label}</b>. {view.measure.definition}
            </p>
        )}

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

        {view.sources.length > 0 && (
            <div className={styles.block} data-block="sources">
                <p className={styles.fieldLabel}>
                    {view.sources.length > 1 ? 'Sources' : 'Source'}
                </p>
                {view.from && <p className={styles.from}>{view.from}</p>}
                <ul className={styles.sources}>
                    {/* A described source holds its name and page, so there is nothing to look up. */}
                    {view.sources.map((source) => (
                        <SourceEntry key={source.key} source={source} open={false} />
                    ))}
                </ul>
            </div>
        )}

        <div className={styles.cite} data-block="cite">
            <p className={styles.fieldLabel}>Cite as</p>
            <CiteForm kind="Short form" text={view.cite.short} label="Copy short citation" />
            <CiteForm kind="Reference list" text={view.cite.full} label="Copy full citation" />
            {view.cite.hint && <p className={styles.hint}>{view.cite.hint}</p>}
        </div>

        {download}

        {view.made && (
            <details className={styles.indicator} data-block="made">
                <summary className={styles.indicatorHead}>
                    <span className={styles.indicatorName}>How this card was made</span>
                    <Icon name="chevron-down" className={styles.indicatorChevron} />
                </summary>
                <div className={styles.made}>
                    {view.made.steps.length > 0 && <Items items={view.made.steps} />}
                    {view.made.notes.length > 0 && <Items items={view.made.notes} />}
                    {view.made.pages.map((page) => (
                        <SourceLink key={page.key} className={styles.madeLink} dcid={page.page}>
                            {page.name}
                            <Icon name="arrow-up-right" className={styles.madeLinkIcon} />
                        </SourceLink>
                    ))}
                </div>
            </details>
        )}
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

/** The snapshot share a card is cited from: its id, when the share was
 *  made, and when the card's slot began to show the data it shows, which
 *  the citation prefers. Both times are ISO timestamps. */
export type CitedSnapshot = { id: string; createdAt?: string; servedAt?: string };

// The link a snapshot share is cited by, read in the browser, where the
// panel opens.
const snapshotUrlOf = (shareId: string | undefined): string | null =>
    shareId && typeof window !== 'undefined'
        ? `${window.location.origin}/s/${encodeURIComponent(shareId)}`
        : null;

// The day a snapshot card's data dates from, in the reader's time zone:
// when its slot began to show it, or when the share was made if that is
// not known.
const snapshotAsOfOf = (snapshot: CitedSnapshot | undefined): string | null => {
    const at = snapshot?.servedAt ?? snapshot?.createdAt;
    const moment = at ? new Date(at) : null;

    return moment && !Number.isNaN(moment.getTime()) ? localDay(moment) : null;
};

/**
 * More Info, the back of the card. A card that carries a description shows
 * it as `DescribedPanel` lays it out, with no request. A card without one
 * shows the legacy panel. Download Data sits after the citation either way.
 * On a share whose slot draws the card (`shared`) it serves the rows that
 * slot serves. The card's
 * owner (`canShare`) is told how to get a link to cite. The full citation
 * is retrieved today. On a snapshot share (`snapshot`) it names the share's
 * link and the day the card's data dates from.
 */
const CardInfoPanel = ({
    info,
    widget,
    open,
    onOpenChange,
    shared,
    snapshot,
    canShare = false,
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
}) => {
    const view =
        info &&
        panelViewOf(info, {
            retrievedOn: localDay(new Date()),
            snapshotUrl: snapshotUrlOf(snapshot?.id),
            snapshotAsOf: snapshotAsOfOf(snapshot),
            canShare,
        });
    const download = widget && <CardDownload widget={widget} shared={shared} />;

    return (
        <Modal open={open && view !== null} onOpenChange={onOpenChange} title="More Info">
            {view?.kind === 'described' && <DescribedPanel view={view} download={download} />}
            {view?.kind === 'legacy' && <LegacyPanel view={view} open={open} download={download} />}
        </Modal>
    );
};

export default CardInfoPanel;
