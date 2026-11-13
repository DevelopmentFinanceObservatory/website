import styles from './LoadStatus.module.scss';
import type { Loadable } from './useExplorerData';

import Button from '@/components/atoms/Button/Button';
import Spinner from '@/components/atoms/Spinner/Spinner';
import { BUILDING, waitText } from '@/lib/graphExplorer/load';

type LoadStatusProps = {
    /** The model's state while it is not ready. */
    state: Exclude<Loadable<unknown>, { status: 'ready' }>;
    onRetry: () => void;
};

/** The screen while the model loads, waits for a build, or has failed. */
const LoadStatus = ({ state, onRetry }: LoadStatusProps) => {
    if (state.status === 'failed') {
        return (
            <div className={styles.status} role="alert">
                <h1 className={styles.title}>
                    {state.reason === 'build_timeout'
                        ? `The Graph API is still ${BUILDING}`
                        : 'The model could not be loaded'}
                </h1>
                <p className={styles.message}>{state.message}</p>
                <div>
                    <Button onClick={onRetry}>Try Again</Button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.status} role="status">
            <Spinner size={24} label="Loading" />
            <p className={styles.message}>
                {state.retryInMs === null ? 'Loading the DFO model.' : waitText(state.retryInMs)}
            </p>
        </div>
    );
};

export default LoadStatus;
