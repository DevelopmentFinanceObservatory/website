'use client';

import classNames from 'classnames';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import styles from './EditArtifact.module.scss';
import ReplacementPicker from './ReplacementPicker';

import Button from '@/components/atoms/Button/Button';
import type { ReplacementChoice } from '@/lib/library/artifact';
import { replaceArtifact } from '@/lib/library/client';

/**
 * An admin's form on a withdrawn artifact's address: the pick of the
 * artifact on show it links to, and Save. Saving no pick clears the link.
 */
const SetReplacement = ({
    id,
    replacedBy,
    choices,
}: {
    id: string;
    replacedBy: string | null;
    choices: readonly ReplacementChoice[];
}) => {
    const router = useRouter();
    const [picked, setPicked] = useState(replacedBy);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const save = async (event: React.FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);

        const answer = await replaceArtifact(id, picked);

        setBusy(false);

        if (answer.ok) {
            router.refresh();
        } else {
            setError(answer.detail);
        }
    };

    return (
        <form className={classNames(styles.form, styles.replacementForm)} onSubmit={save}>
            <ReplacementPicker
                choices={choices}
                value={picked}
                onChange={setPicked}
                disabled={busy}
            />
            {error && (
                <p className={styles.error} role="alert">
                    {error}
                </p>
            )}
            <div>
                <Button variant="bordered" type="submit" disabled={busy || picked === replacedBy}>
                    {busy ? 'Saving…' : 'Save Replacement'}
                </Button>
            </div>
        </form>
    );
};

export default SetReplacement;
