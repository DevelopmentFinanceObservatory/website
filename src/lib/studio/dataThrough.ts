/**
 * How recent a card's data is, as the platform wrote it, and the one line a
 * reader sees for a card or a canvas of them. A period ("2024", "2025-Q2")
 * is printed as it is, since it is a period and not a day.
 */

import { cardDescription } from './infoPanel.ts';
import type { CardInfo } from '../chat/widgets.ts';

/** One card's data dates. Either is null when the card does not say. */
export type CardDataDates = { dataThrough: string | null; lastRefreshed: string | null };

/**
 * The card's data dates. A legacy card carries them in its provenance. A
 * described card's provenance holds lineage only, so its data runs through
 * the latest period its description names.
 */
export const cardDataDates = (info: CardInfo | undefined): CardDataDates => ({
    dataThrough:
        info?.dataThrough || (info && cardDescription(info)?.freshness.latest_period) || null,
    lastRefreshed: info?.lastRefreshed || null,
});

// The period's last point: a span ("2018/2022") runs through its end.
const lastPoint = (period: string): string => period.split('/').at(-1) ?? period;

/**
 * What "Data through" reads for these cards: the one period they all reach,
 * or the earliest and latest with an en dash ("2022–2024"). Null when no
 * card names one. Periods of one form sort as text ("2024" before
 * "2024-Q3").
 */
export const dataThroughText = (periods: readonly (string | null)[]): string | null => {
    const points = [
        ...new Set(periods.filter((period) => period !== null).map(lastPoint)),
    ].toSorted();

    if (points.length === 0) {
        return null;
    }

    return points.length === 1 ? points[0] : `${points[0]}–${points.at(-1)}`;
};
