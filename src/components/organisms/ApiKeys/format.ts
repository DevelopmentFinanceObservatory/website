/** A date as the key tables show it, in UTC so a server and a reader agree. */
export const formatDate = (date: Date | null): string =>
    date
        ? date.toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              timeZone: 'UTC',
          })
        : '—';

/** A date given as an ISO string (as a JSON route returns it), formatted like `formatDate`. */
export const formatIsoDate = (iso: string | null): string => formatDate(iso ? new Date(iso) : null);
