'use client';

import { useEffect, useState } from 'react';

import { useCopied } from '../hooks/useCopied';
import CardDownload from './CardDownload';
import styles from './CardInfoPanel.module.scss';

import Icon from '@/components/atoms/Icon/Icon';
import Modal from '@/components/molecules/Modal/Modal';
import type { CardInfo, CardSource, Widget } from '@/lib/chat/widgets';
import { formatWindow } from '@/lib/studio/period';

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

// A `spec_` or `ops_` id names the card's own frame, a sum of indicators,
// which no reader can look up.
const isFrameId = (id: string): boolean => /^(dcid:)?(spec|ops)_/.test(id);

// The engine ships a machine string when it has no prose ("md=Count_Person,mp=amount,…").
const readable = (text: string): boolean => !!text && !/^[a-z_]+=/.test(text);

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

// One source the card cites: the graph's own name for it when its
// documentation has one, linked to the source itself, then its licence and
// retrieval date.
const SourceEntry = ({ source, open }: { source: CardSource; open: boolean }) => {
    const doc = useSourceDoc(open ? source.id : null);
    const url = source.url ?? doc?.url ?? null;
    const name = doc?.name ?? source.name;

    return (
        <li className={styles.source}>
            {url ? (
                <a className={styles.sourceName} href={url} target="_blank" rel="noreferrer">
                    {name}
                    <Icon name="arrow-up-right" className={styles.sourceIcon} />
                </a>
            ) : (
                <p className={styles.sourceName}>{name}</p>
            )}
            <p className={styles.sourceMeta}>
                {source.licence ?? 'Licence not stated'}
                {source.retrieved && ` · retrieved ${source.retrieved}`}
            </p>
        </li>
    );
};

/**
 * More Info, the back of the card: the citation with a copy action, every
 * source the card cites, the years and indicators it covers and how fresh
 * the data is, then Download Data, then each indicator with its id and
 * description. Everything comes from the card's frame; a field the platform
 * didn't fill isn't shown. A card saved before its sources were recorded
 * shows the one source it kept.
 */
const CardInfoPanel = ({
    info,
    widget,
    open,
    onOpenChange,
}: {
    info: CardInfo | null;
    // The card itself, for Download Data.
    widget: Widget | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) => {
    const sources: CardSource[] =
        info?.sources ??
        (info?.sourceId && info.sourceName
            ? [
                  {
                      id: info.sourceId,
                      name: info.sourceName,
                      licence: info.licence,
                      url: null,
                      retrieved: null,
                  },
              ]
            : []);

    return (
        <Modal open={open && info !== null} onOpenChange={onOpenChange} title="More Info">
            {info && (
                <div className={styles.panel}>
                    {info.citation && (
                        <div className={styles.citation}>
                            <p className={styles.fieldLabel}>Cite as</p>
                            <span className={styles.id}>
                                <span className={styles.citationText}>{info.citation}</span>
                                <CopyButton value={info.citation} label="Copy citation" />
                            </span>
                        </div>
                    )}

                    {sources.length > 0 && (
                        <ul className={styles.sources}>
                            {sources.map((source) => (
                                <SourceEntry key={source.id} source={source} open={open} />
                            ))}
                        </ul>
                    )}

                    <dl className={styles.rows}>
                        {info.years && (
                            <div className={styles.row}>
                                <dt className={styles.label}>Years</dt>
                                <dd className={styles.value}>{formatWindow(info.years)}</dd>
                            </div>
                        )}
                        <div className={styles.row}>
                            <dt className={styles.label}>Indicators</dt>
                            <dd className={styles.value}>{info.indicatorCount}</dd>
                        </div>
                        {info.unit && (
                            <div className={styles.row}>
                                <dt className={styles.label}>Unit</dt>
                                <dd className={styles.value}>{info.unit}</dd>
                            </div>
                        )}
                        {info.dataThrough && (
                            <div className={styles.row}>
                                <dt className={styles.label}>Data through</dt>
                                <dd className={styles.value}>{info.dataThrough}</dd>
                            </div>
                        )}
                        {info.lastRefreshed && (
                            <div className={styles.row}>
                                <dt className={styles.label}>Last refreshed</dt>
                                <dd className={styles.value}>{info.lastRefreshed}</dd>
                            </div>
                        )}
                    </dl>

                    {widget && <CardDownload widget={widget} />}

                    {info.indicators.map((indicator, index) => (
                        <details key={indicator.id} className={styles.indicator} open={index === 0}>
                            <summary className={styles.indicatorHead}>
                                <span className={styles.indicatorName}>{indicator.name}</span>
                                <Icon name="chevron-down" className={styles.indicatorChevron} />
                            </summary>
                            <div className={styles.indicatorBody}>
                                {!isFrameId(indicator.id) && (
                                    <>
                                        <p className={styles.fieldLabel}>ID</p>
                                        <CopyId value={indicator.id.replace(/^dcid:/, '')} />
                                    </>
                                )}
                                {readable(indicator.description) && (
                                    <>
                                        <p className={styles.fieldLabel}>Description</p>
                                        <p className={styles.description}>
                                            {indicator.description}
                                        </p>
                                    </>
                                )}
                            </div>
                        </details>
                    ))}
                </div>
            )}
        </Modal>
    );
};

export default CardInfoPanel;
