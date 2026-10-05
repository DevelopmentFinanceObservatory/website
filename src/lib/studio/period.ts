/**
 * A period as a reader sees it. The platform writes an observed span as an
 * ISO 8601 interval (`2018/2022`, `2018-01/2022-12`); the card shows it with
 * an en dash. A point period (`2023`, `2023-04`, `2023-04-05`) shows as it is.
 * CSV cells, JSON keys, URLs and sort order keep the platform's string.
 */
export const formatPeriod = (period: string): string => {
    const [start, end, ...rest] = period.split('/');

    return start && end && rest.length === 0 ? `${start}–${end}` : period;
};

/** A window as a reader sees it: one period when it starts and ends on the
 *  same one ("2024"), else both ends with an en dash ("2020–2024"). */
export const formatWindow = ({ start, end }: { start: string; end: string }): string =>
    start === end ? formatPeriod(start) : `${formatPeriod(start)}–${formatPeriod(end)}`;
