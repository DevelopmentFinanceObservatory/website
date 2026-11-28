import styles from './EvergreenWarnings.module.scss';

import type { EvergreenField, EvergreenWarning } from '@/lib/library/client';

const FIELD_LABEL: Record<EvergreenField, string> = {
    title: 'Title',
    description: 'Description',
    contentTitle: 'Content title',
    content: 'Content',
};

/**
 * The sentences a saved publish or edit flagged. The text is stored as
 * written; the list asks the publisher to look at each sentence again.
 */
const EvergreenWarnings = ({ warnings }: { warnings: readonly EvergreenWarning[] }) => (
    <div className={styles.warnings} role="status">
        <p className={styles.heading}>
            {warnings.length === 1
                ? 'Check this sentence: it may state something a data update can change.'
                : 'Check these sentences: they may state something a data update can change.'}
        </p>
        <ul className={styles.list}>
            {warnings.map((warning) => (
                <li key={`${warning.field}-${warning.start}-${warning.end}`}>
                    <span className={styles.field}>{FIELD_LABEL[warning.field]}</span>{' '}
                    <q>{warning.quote}</q>
                </li>
            ))}
        </ul>
    </div>
);

export default EvergreenWarnings;
