'use client';

import { useState } from 'react';

import styles from './ApiKeysPanel.module.scss';
import { formatIsoDate, keySnippet } from './format';
import type { KeyView } from './state';

import Button from '@/components/atoms/Button/Button';
import UsageMeter from '@/components/atoms/UsageMeter/UsageMeter';

type KeyCardProps = {
    item: KeyView;
    // A delete of this key is in flight.
    busy: boolean;
    onDelete: () => void;
};

/** One key: name, prefix, dates, today's usage, and Delete (confirmed in place). */
const KeyCard = ({ item, busy, onDelete }: KeyCardProps) => {
    const [confirming, setConfirming] = useState(false);

    return (
        <article className={styles.card}>
            <h4 className={styles.cardName}>{item.name || 'Unnamed'}</h4>
            <p className={styles.muted}>
                <code className={styles.prefix}>{keySnippet(item.start, item.tail)}</code>
            </p>
            <p className={styles.muted}>Created {formatIsoDate(item.createdAt)}</p>
            <p className={styles.muted}>
                {item.lastRequest ? `Last used ${formatIsoDate(item.lastRequest)}` : 'Never used'}
            </p>

            <UsageMeter
                used={item.usedToday}
                limit={item.dailyLimit}
                label="API calls today"
                className={styles.meter}
            />
            <p className={styles.caption}>
                of {item.dailyLimit.toLocaleString('en-GB')} calls today · resets 00:00 UTC
            </p>

            {confirming ? (
                <div className={styles.confirm}>
                    <p className={styles.confirmText}>
                        Delete this key? Programs using it stop working.
                    </p>
                    <div className={styles.actions}>
                        <Button
                            small
                            variant="paper"
                            disabled={busy}
                            onClick={() => setConfirming(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            small
                            variant="dark"
                            className={styles.danger}
                            disabled={busy}
                            onClick={onDelete}
                        >
                            {busy ? 'Deleting…' : 'Delete'}
                        </Button>
                    </div>
                </div>
            ) : (
                <div className={styles.actions}>
                    <Button
                        small
                        variant="paper"
                        disabled={busy}
                        onClick={() => setConfirming(true)}
                    >
                        Delete
                    </Button>
                </div>
            )}
        </article>
    );
};

export default KeyCard;
