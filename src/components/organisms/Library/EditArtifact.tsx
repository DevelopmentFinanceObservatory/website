'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import ArtifactFields, { isComplete } from './ArtifactFields';
import styles from './EditArtifact.module.scss';

import Button from '@/components/atoms/Button/Button';
import Modal from '@/components/molecules/Modal/Modal';
import type { LibraryArtifact } from '@/lib/library/artifact';
import { deleteArtifact, editArtifact } from '@/lib/library/client';
import type { ArtifactText } from '@/lib/library/publish';

/**
 * The artifact page's Edit button and its dialog, which admins alone are
 * given: the artifact's text and topics, Save Changes, and Delete from
 * Library. Delete swaps itself for a question with "Keep it" in its place and
 * "Delete" below, so a double-click lands on "Keep it". The artifact's share,
 * type and status stay as published, and the Studio publishes a different one.
 */

const textOf = (artifact: LibraryArtifact): ArtifactText => ({
    title: artifact.title,
    description: artifact.description,
    contentTitle: artifact.contentTitle,
    content: artifact.content,
    topics: artifact.topics,
});

const EditArtifact = ({ artifact }: { artifact: LibraryArtifact }) => {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [text, setText] = useState(() => textOf(artifact));
    const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
    const [confirming, setConfirming] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const show = (next: boolean) => {
        if (next) {
            setText(textOf(artifact));
            setConfirming(false);
            setError(null);
        }

        setOpen(next);
    };

    const save = async (event: React.FormEvent) => {
        event.preventDefault();

        if (busy || !isComplete(text)) {
            return;
        }

        setBusy('save');
        setError(null);

        const answer = await editArtifact(artifact.id, text);

        setBusy(null);

        if (answer.ok) {
            setOpen(false);
            router.refresh();
        } else {
            setError(answer.detail);
        }
    };

    const remove = async () => {
        setBusy('delete');
        setError(null);

        const answer = await deleteArtifact(artifact.id);

        if (answer.ok) {
            router.push('/library');
            router.refresh();
        } else {
            setBusy(null);
            setError(answer.detail);
        }
    };

    return (
        <>
            <Button variant="bordered" full icon="edit" onClick={() => show(true)}>
                Edit
            </Button>
            <Modal open={open} onOpenChange={show} title="Edit" fit>
                <form className={styles.form} onSubmit={save}>
                    <ArtifactFields value={text} onChange={setText} />
                    {error && (
                        <p className={styles.error} role="alert">
                            {error}
                        </p>
                    )}
                    <div className={styles.actions}>
                        <Button
                            variant="dark"
                            full
                            icon="arrow"
                            type="submit"
                            disabled={busy !== null || !isComplete(text)}
                        >
                            {busy === 'save' ? 'Saving…' : 'Save Changes'}
                        </Button>
                        {confirming ? (
                            <>
                                {/* In the place of "Delete from Library", so a
                                    second click of a double-click keeps it. */}
                                <Button
                                    variant="bordered"
                                    full
                                    onClick={() => setConfirming(false)}
                                    disabled={busy !== null}
                                >
                                    Keep it
                                </Button>
                                <Button
                                    variant="bordered"
                                    full
                                    icon="remove"
                                    className={styles.delete}
                                    onClick={remove}
                                    disabled={busy !== null}
                                >
                                    {busy === 'delete' ? 'Deleting…' : 'Delete'}
                                </Button>
                            </>
                        ) : (
                            <Button
                                variant="bordered"
                                full
                                icon="remove"
                                className={styles.delete}
                                onClick={() => setConfirming(true)}
                                disabled={busy !== null}
                            >
                                Delete from Library
                            </Button>
                        )}
                        {/* In the page from the start, so its line is announced. */}
                        <p className={styles.warning} role="status">
                            {confirming &&
                                'Its page and citable URL will show a withdrawn notice. This cannot be undone.'}
                        </p>
                    </div>
                </form>
            </Modal>
        </>
    );
};

export default EditArtifact;
