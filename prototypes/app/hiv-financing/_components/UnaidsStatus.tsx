import styles from './UnaidsStatus.module.scss';
import type { UnaidsState } from './useUnaids';

/**
 * Where the UNAIDS figures are not yet on the page, says why: a loading line while the reads
 * run, or the failure with its message. Renders nothing once the figures are in.
 */
export const UnaidsStatus = ({
    state,
    what,
}: {
    state: UnaidsState;
    /** What waits on the figures, as the line names it: "the strip", "the UNAIDS columns". */
    what: string;
}) => {
    if (state.status === 'ready') {
        return null;
    }

    return state.status === 'loading' ? (
        <p className={styles.status} role="status">
            Loading the UNAIDS estimates for {what}…
        </p>
    ) : (
        <p className={`${styles.status} ${styles.error}`} role="alert">
            The UNAIDS estimates did not load, so {what} cannot show them. Reload the page to try
            again. ({state.error.message})
        </p>
    );
};
