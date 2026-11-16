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
