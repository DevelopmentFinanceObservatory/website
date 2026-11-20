import styles from './UnaidsStatus.module.scss';
import type { UnaidsState } from './useUnaids';

/** The code a failed read carries, as the client's errors and `UnaidsRowsError` name it, or
 *  the error's name, such as "TypeError" for a request the browser refused. */
const errorCode = (error: Error): string =>
    'code' in error && typeof error.code === 'string' ? error.code : error.name;

/**
 * Where the UNAIDS figures are not yet on the page, says why: a loading line while the reads
 * run, or the failure with its code. Renders nothing once the figures are in. Every place
 * waiting on the figures shows the failure, and one of them, `announce`, raises it to screen
 * readers. useUnaids logs the full error to the console.
 */
export const UnaidsStatus = ({
    state,
    what,
    announce = false,
    failed,
}: {
    state: UnaidsState;
    /** What waits on the figures, as the loading line names it: "the strip", "the UNAIDS
     *  columns". */
    what: string;
    /** This line is the page's one alert for a failure. */
    announce?: boolean;
    /** A sentence after the failure on what the reader sees in its place. */
    failed?: string;
}) => {
    if (state.status === 'ready') {
        return null;
    }

    return state.status === 'loading' ? (
        <p className={styles.status} role="status">
            Loading the UNAIDS estimates for {what}…
        </p>
    ) : (
        <p className={`${styles.status} ${styles.error}`} role={announce ? 'alert' : undefined}>
            The UNAIDS estimates did not load. Reload the page to try again.
            {failed !== undefined && ` ${failed}`}{' '}
            <small className={styles.code}>({errorCode(state.error)})</small>
        </p>
    );
};
