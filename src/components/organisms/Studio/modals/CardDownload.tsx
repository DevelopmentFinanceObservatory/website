'use client';

import styles from './CardDownload.module.scss';
import { useCardDownload } from '../hooks/useCardDownload';

import DatasetDownload from '@/components/organisms/DataSearch/DatasetDownload';
import type { CardInfo, CardRef, Widget } from '@/lib/chat/widgets';
import { cardRefOf, type LiveCardAddress } from '@/lib/studio/cardDownload';
import { formatWindow } from '@/lib/studio/period';

type DetailRow = { label: string; value: string };

const detailRows = (info: CardInfo): DetailRow[] => {
    const source =
        info.sourceCount > 1
            ? { label: 'Sources', value: `${info.sourceCount} sources` }
            : { label: 'Source', value: info.sources?.[0]?.name ?? info.sourceName };
    const rows: (DetailRow | null)[] = [
        info.years
            ? {
                  label: 'Years',
                  value: formatWindow(info.years),
              }
            : null,
        { label: 'Indicators', value: String(info.indicatorCount) },
        info.unit ? { label: 'Unit', value: info.unit } : null,
        source.value ? { label: source.label, value: source.value } : null,
    ];

    return rows.filter((row) => row !== null);
};

// What the file holds, from the card's own info: the rows Search's panel shows
// under Details.
const CardDetails = ({ info }: { info: CardInfo }) => (
    <dl className={styles.details}>
        {detailRows(info).map((row) => (
            <div key={row.label} className={styles.detailRow}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
            </div>
        ))}
    </dl>
);

const CardRows = ({
    cardRef,
    info,
    live,
}: {
    cardRef: CardRef;
    info: CardInfo | null;
    live: LiveCardAddress | null;
}) => {
    const state = useCardDownload(cardRef, live);

    return (
        <section className={styles.section}>
            <p className={styles.heading}>This card&apos;s data</p>
            <p className={styles.note}>Every value behind this card, with its sources.</p>
            {info && <CardDetails info={info} />}
            <DatasetDownload state={state} />
        </section>
    );
};

/**
 * Download Data for one card, laid out as Search's panel: what the file
 * holds, then the download sheet (format, README and citations) over the
 * export route. `details` adds the Details rows. More Info leaves them out,
 * since its own rows above already describe the data. Renders nothing for a
 * card with no revision to export, such as a text card or one saved before
 * cards kept their revision. `liveShareId` is the live share the card is
 * shown on: the file then holds the rows the share last refreshed the card
 * on, from the share's own data route.
 */
const CardDownload = ({
    widget,
    details = false,
    liveShareId,
}: {
    widget: Widget;
    details?: boolean;
    liveShareId?: string;
}) => {
    const cardRef = cardRefOf(widget);

    return cardRef ? (
        <CardRows
            cardRef={cardRef}
            info={details ? (widget.info ?? null) : null}
            live={liveShareId ? { shareId: liveShareId, cardId: widget.id } : null}
        />
    ) : null;
};

export default CardDownload;
