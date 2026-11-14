import styles from './LoadStatus.module.scss';

import Button from '@/components/atoms/Button/Button';
import Spinner from '@/components/atoms/Spinner/Spinner';
import { BUILDING, waitText, type Loadable } from '@/lib/graphExplorer/load';

/** What is loading: the DFO model, or the base Data Commons terms list. */
type Subject = 'model' | 'terms';

const WORDS: Readonly<Record<Subject, { loading: string; failed: string }>> = {
    model: { loading: 'Loading the DFO model.', failed: 'The model could not be loaded' },
    terms: {
        loading: 'Loading base Data Commons terms.',
        failed: 'Base Data Commons terms could not be loaded',
    },
};

type LoadStatusProps = {
    /** The document's state while it is not ready. */
    state: Exclude<Loadable<unknown>, { status: 'ready' }>;
    onRetry: () => void;
    subject?: Subject;
};

/** The screen while a document loads, waits before a retry, or has failed. */
const LoadStatus = ({ state, onRetry, subject = 'model' }: LoadStatusProps) => {
    if (state.status === 'failed') {
        // Each line says something the other does not: a heading naming the
        // build reads with the full message, one naming the document with
        // what went wrong.
        const building = state.reason === 'build_timeout';
        return (
            <div className={styles.status} role="alert">
                <h1 className={styles.title}>
                    {building ? `The Graph API is still ${BUILDING}` : WORDS[subject].failed}
                </h1>
                <p className={styles.message}>{building ? state.message : state.explanation}</p>
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
                {state.waiting === null
                    ? WORDS[subject].loading
                    : waitText(state.waiting.retryInMs, state.waiting.cause)}
            </p>
        </div>
    );
};

export default LoadStatus;
