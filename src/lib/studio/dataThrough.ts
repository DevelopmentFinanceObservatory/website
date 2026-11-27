/**
 * How recent a card's data is, as the platform wrote it, and the one line a
 * reader sees for a card or a canvas of them. A period ("2024", "2025-Q2")
 * prints in the platform's own form.
 */

import { cardDescription } from './infoPanel.ts';
import type { LiveCanvas } from './liveCards.ts';
import type { CardInfo, Widget } from '../chat/widgets.ts';

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

const pad = (value: number): string => String(value).padStart(2, '0');

// The last day of month `month` (1 to 12) of `year`, as YYYY-MM-DD.
const monthEnd = (year: number, month: number): string =>
    `${year}-${pad(month)}-${pad(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;

// The day a period ends on, as YYYY-MM-DD: a year on 31 December, a half,
// quarter or month on its last day, and a day on itself. A period in another
// form keeps its own text, which sorts after the years it starts with.
const endDay = (period: string): string => {
    const [, yearText, part, index] = /^(\d{4})(?:-(H|Q|)(\d{1,2}))?$/.exec(period) ?? [];
    const year = Number(yearText);

    // A day ("2024-06-30") is its own end.
    if (!yearText) {
        return period;
    }

    if (index === undefined) {
        return `${year}-12-31`;
    }

    const months = { H: 6, Q: 3, '': 1 }[part ?? ''] ?? 1;

    return monthEnd(year, Number(index) * months);
};

// The distinct periods the cards name, by the day each ends.
const byEnd = (periods: readonly (string | null)[]): string[] =>
    [...new Set(periods.filter((period) => period !== null).map(lastPoint))]
        .map((point) => ({ point, end: endDay(point) }))
        .toSorted((a, b) => a.end.localeCompare(b.end) || a.point.localeCompare(b.point))
        .map(({ point }) => point);

/**
 * What "Data through" reads for these cards: the one period they all reach,
 * or the earliest and latest with an en dash ("2022–2024"). Null when no
 * card names one. Periods order by the day they end, so "2024-06" comes
 * before "2024", which runs to December.
 */
export const dataThroughText = (periods: readonly (string | null)[]): string | null => {
    const points = byEnd(periods);
    const [first] = points;
    const last = points.at(-1);

    if (first === undefined || last === undefined) {
        return null;
    }

    return first === last ? first : `${first}–${last}`;
};

/** The latest period the cards name, and whether every card that names one
 *  names that one. Null when none does. */
export type LatestPeriod = { period: string; shared: boolean };

/** The latest period the cards name (`byEnd`), for a live canvas whose cards
 *  each reach their own. */
export const latestPeriod = (periods: readonly (string | null)[]): LatestPeriod | null => {
    const points = byEnd(periods);
    const period = points.at(-1);

    return period === undefined ? null : { period, shared: points.length === 1 };
};

/** The latest period of a live canvas's cards filled so far. Held and
 *  failed cards name none. */
export const liveDataThrough = (
    widgets: readonly Widget[],
    live: LiveCanvas,
): LatestPeriod | null =>
    latestPeriod(
        widgets.map((widget) =>
            widget.kind !== 'text' && live.states[widget.id]?.status === 'ready'
                ? cardDataDates(widget.info).dataThrough
                : null,
        ),
    );
