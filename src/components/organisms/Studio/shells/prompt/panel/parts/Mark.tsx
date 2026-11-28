import styles from './parts.module.scss';

export type MarkState = 'done' | 'running' | 'waiting' | 'pending' | 'skipped' | 'failed';

const WORDS: Record<MarkState, string> = {
    done: 'Done:',
    running: 'Running:',
    waiting: 'Waiting for you:',
    pending: 'Not started:',
    skipped: 'Not run:',
    failed: 'Hit an error:',
};

/** A 12 px status circle, with the status in words for screen readers. */
export const Mark = ({ state }: { state: MarkState }) => (
    <>
        <span className={styles.mark} data-state={state} aria-hidden="true" />
        <span className={styles.vh}>{WORDS[state]}</span>
    </>
);
