'use client';

import styles from './DataSearch.module.scss';

import Button from '@/components/atoms/Button/Button';

export type DepartureItem = {
    key: string;
    /** the part's variable text, when the answer has several parts */
    prefix: string | null;
    text: string;
    /** the one action the departure offers, when it offers one; a Studio
     *  hand-off draws as the arrow Button beside the sentence */
    action: { label: string; run: () => void; studio: boolean } | null;
};

/** How each part's answer differs from what it asked, one line per
 *  departure in the order the parts list them, under the heading. A
 *  departure that hands the question to Studio puts the arrow Button beside
 *  its sentence, below it at phone width; any other action is a link at the
 *  end of the sentence. */
const DepartureList = ({ items }: { items: DepartureItem[] }) => {
    if (items.length === 0) return null;

    return (
        <ul className={styles.departures}>
            {items.map(({ key, prefix, text, action }) => {
                const sentence = `${prefix ? `${prefix}: ` : ''}${text}`;

                if (action?.studio) {
                    return (
                        <li key={key} className={styles.departureStudio}>
                            <span>{sentence}</span>
                            <Button icon="arrow" onClick={action.run}>
                                {action.label}
                            </Button>
                        </li>
                    );
                }

                return (
                    <li key={key}>
                        {sentence}
                        {action && (
                            <>
                                {' '}
                                <button
                                    type="button"
                                    className={styles.departureAction}
                                    onClick={action.run}
                                >
                                    {action.label}
                                </button>
                            </>
                        )}
                    </li>
                );
            })}
        </ul>
    );
};

export default DepartureList;
