'use client';

import classNames from 'classnames';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import styles from './EditArtifact.module.scss';
import ReplacementPicker from './ReplacementPicker';

import Button from '@/components/atoms/Button/Button';
import type { Replacement, ReplacementChoice } from '@/lib/library/artifact';
import { replaceArtifact } from '@/lib/library/client';

/**
 * An admin's form on a withdrawn artifact's address: the pick of the
 * artifact on show it links to, and Save. When the artifact it names has
 * since been withdrawn too, so the picker lacks it, a line says so and
 * names where the chain leads (`replacement`). Clear removes the link.
 */
const SetReplacement = ({
    id,
    replacedBy,
    replacement,
    choices,
}: {
    id: string;
    replacedBy: string | null;
    replacement: Replacement | null;
    choices: readonly ReplacementChoice[];
}) => {
    const router = useRouter();
    const [picked, setPicked] = useState(replacedBy);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const named = replacedBy !== null && !choices.some((choice) => choice.id === replacedBy);

    const send = async (next: string | null) => {
        setBusy(true);
        setError(null);

        const answer = await replaceArtifact(id, next);

        setBusy(false);

        if (answer.ok) {
            setPicked(next);
            router.refresh();
        } else {
            setError(answer.detail);
        }
    };

    const save = (event: React.FormEvent) => {
        event.preventDefault();
        void send(picked);
    };

    return (
        <form className={classNames(styles.form, styles.replacementForm)} onSubmit={save}>
            {named && (
                <p className={styles.current}>
                    {replacement
                        ? `It links to a withdrawn artifact, whose chain leads to ${replacement.title}.`
                        : 'It links to a withdrawn artifact, whose chain leads to no published artifact.'}
                </p>
            )}
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
            <div className={styles.replacementActions}>
                <Button
                    variant="bordered"
                    type="submit"
                    disabled={busy || picked === null || picked === replacedBy}
                >
                    {busy ? 'Saving…' : 'Save Replacement'}
                </Button>
                {replacedBy !== null && (
                    <Button variant="bordered" onClick={() => void send(null)} disabled={busy}>
                        Clear Replacement
                    </Button>
                )}
            </div>
        </form>
    );
};

export default SetReplacement;
