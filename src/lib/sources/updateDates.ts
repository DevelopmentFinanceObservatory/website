/**
 * The dates on a source page's License & Updates block. `last_update` is the
 * day DFO downloaded the data, a date ("2026-10-05") or a timestamp
 * ("2026-10-02T17:23:42Z"); `next_expected_update` is the publisher's next
 * release, usually a month ("2026-09"). Both read in UTC, so a timestamp
 * names the same day on every reader's clock. `shortDateText` also writes the
 * snapshot dates the citation and the /data banner share.
 */

const MONTH = /^(\d{4})-(\d{2})$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/;

const monthFormat = new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
});
const dayFormat = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
});

type SourceDate = { date: Date; precision: 'month' | 'day' };

// The UTC start of a calendar day, or null where the parts name no such day
// ("2026-13", "2026-02-30").
const utcDay = (year: number, month: number, day: number): Date | null => {
    const date = new Date(Date.UTC(year, month - 1, day));

    return date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
};

// A month, a date or a timestamp as its UTC start; null for any other text.
const parseSourceDate = (value: string): SourceDate | null => {
    const month = value.match(MONTH);
    const day = month ? null : value.match(DAY);
    const parts = (month ?? day)?.slice(1).map(Number);

    if (!parts) {
        return null;
    }

    const [year = 0, monthNumber = 0, dayNumber = 1] = parts;
    const date = utcDay(year, monthNumber, dayNumber);

    return date && { date, precision: month ? 'month' : 'day' };
};

const formatSourceDate = ({ date, precision }: SourceDate): string =>
    (precision === 'month' ? monthFormat : dayFormat).format(date);

/** A source date in words at the precision it carries: "September 2026" for
 *  a month, "5 October 2026" for a date or a timestamp. Text in any other
 *  form stands as it is. */
export const sourceDateText = (value: string): string => {
    const parsed = parseSourceDate(value);

    return parsed ? formatSourceDate(parsed) : value;
};

// The months as the citation guide shortens them ("28 Sep 2026"). Spelt
// out because ICU's en-GB short form differs by version ("Sep", "Sept").
const SHORT_MONTHS = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
];

/** A calendar date, held as its UTC start, in the short form the citation
 *  guide uses: "28 Sep 2026". */
export const shortDateText = (date: Date): string =>
    `${date.getUTCDate()} ${SHORT_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;

/** The day a moment falls on in the reader's own time zone, in the short
 *  form of `shortDateText`. */
export const localShortDateText = (moment: Date): string =>
    shortDateText(new Date(Date.UTC(moment.getFullYear(), moment.getMonth(), moment.getDate())));

/** Whether the next release is overdue: its month precedes `now`'s month in
 *  UTC. A release due this month is not overdue, nor is text that names no
 *  date. */
export const releaseOverdue = (value: string, now: Date): boolean => {
    const parsed = parseSourceDate(value);

    if (!parsed) {
        return false;
    }

    const due = parsed.date.getUTCFullYear() * 12 + parsed.date.getUTCMonth();

    return due < now.getUTCFullYear() * 12 + now.getUTCMonth();
};

/** The "Next release expected" value: the release date in words, marked
 *  "(overdue)" once its month has passed. */
export const nextReleaseText = (value: string, now: Date): string =>
    releaseOverdue(value, now) ? `${sourceDateText(value)} (overdue)` : sourceDateText(value);
