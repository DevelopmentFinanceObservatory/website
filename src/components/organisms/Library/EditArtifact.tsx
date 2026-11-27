'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import ArtifactFields, { evergreenOutcome, isComplete, type Refusals } from './ArtifactFields';
import styles from './EditArtifact.module.scss';
import EvergreenWarnings from './EvergreenWarnings';
import ReplacementPicker from './ReplacementPicker';

import Button from '@/components/atoms/Button/Button';
import Modal from '@/components/molecules/Modal/Modal';
import { artifactPath, type LibraryArtifact, type ReplacementChoice } from '@/lib/library/artifact';
import {
    deleteArtifact,
    editArtifact,
    type EvergreenWarning,
    isArtifactChangedRefusal,
    readEvergreenWarnings,
    withdrawnWithoutReplacement,
} from '@/lib/library/client';
import type { ArtifactText } from '@/lib/library/publish';

/**
 * The artifact page's Edit button and its dialog, which admins alone are
 * given: the artifact's text and topics, Save Changes, and Delete from
 * Library. Delete swaps itself for a question with "Keep it" in its place and
 * "Delete" below, so a double-click lands on "Keep it", and offers a pick of
 * the artifact on show (`replacements`) the withdrawn address then links
 * to. The artifact's share,
 * type and status stay as published, and the Studio publishes a different one.
 */

const textOf = (artifact: LibraryArtifact): ArtifactText => ({
    title: artifact.title,
    description: artifact.description,
    contentTitle: artifact.contentTitle,
    content: artifact.content,
    topics: artifact.topics,
});

const EditArtifact = ({
    artifact,
    replacements,
}: {
    artifact: LibraryArtifact;
    replacements: readonly ReplacementChoice[];
}) => {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [text, setText] = useState(() => textOf(artifact));
    const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
    const [confirming, setConfirming] = useState(false);
    const [replacedBy, setReplacedBy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refusals, setRefusals] = useState<Refusals | null>(null);
    // The edit answered that someone else saved the artifact first.
    const [changed, setChanged] = useState(false);
    // The sentences a saved edit flagged, shown until the dialog is closed.
    const [warnings, setWarnings] = useState<EvergreenWarning[] | null>(null);

    const show = (next: boolean) => {
        if (next) {
            setText(textOf(artifact));
            setConfirming(false);
            setReplacedBy(null);
            setError(null);
            setRefusals(null);
            setChanged(false);
            setWarnings(null);
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
        setRefusals(null);
        setChanged(false);

        const answer = await editArtifact(artifact.id, text, artifact.revision);

        setBusy(null);

        if (answer.ok) {
            const flagged = readEvergreenWarnings(answer.value);

            // The page behind shows the saved text; flagged sentences keep
            // the dialog open so they are read.
            router.refresh();
            setOpen(flagged.length > 0);
            setWarnings(flagged.length > 0 ? flagged : null);
        } else {
            if (isArtifactChangedRefusal(answer.problem)) {
                setChanged(true);

                return;
            }

            const outcome = evergreenOutcome(answer.problem, answer.detail, text);

            setRefusals(outcome.refusals);
            setError(outcome.error);
        }
    };

    const remove = async () => {
        setBusy('delete');
        setError(null);

        const answer = await deleteArtifact(artifact.id, replacedBy);
        const unreplaced = answer.ok ? null : withdrawnWithoutReplacement(answer.problem);

        if (answer.ok) {
            router.push('/library');
            router.refresh();
        } else if (unreplaced) {
            // Withdrawn, and its page is where another replacement is named.
            router.push(`${artifactPath(unreplaced)}?replacement=withdrawn`);
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
                {warnings ? (
                    <div className={styles.form}>
                        <p role="status">The changes were saved.</p>
                        <EvergreenWarnings warnings={warnings} />
                        <Button variant="dark" full onClick={() => setOpen(false)}>
                            Done
                        </Button>
                    </div>
                ) : (
                    <form className={styles.form} onSubmit={save}>
                        <ArtifactFields value={text} onChange={setText} refusals={refusals} />
                        {changed && (
                            <div className={styles.error} role="alert">
                                <p>
                                    Someone else changed this artifact. Reload to see their changes.
                                </p>
                                <Button
                                    variant="bordered"
                                    small
                                    onClick={() => {
                                        // Reopening shows the fresh text.
                                        setOpen(false);
                                        router.refresh();
                                    }}
                                >
                                    Reload
                                </Button>
                            </div>
                        )}
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
                                    <div className={styles.replacement}>
                                        <ReplacementPicker
                                            choices={replacements}
                                            value={replacedBy}
                                            onChange={setReplacedBy}
                                            disabled={busy !== null}
                                        />
                                    </div>
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
                                    `The Library will erase its title and text, its URL will show that it was withdrawn${replacedBy ? ' and link to the replacement picked above' : ''}, and its chart will be taken down or queued for removal. This cannot be undone.`}
                            </p>
                        </div>
                    </form>
                )}
            </Modal>
        </>
    );
};

export default EditArtifact;
