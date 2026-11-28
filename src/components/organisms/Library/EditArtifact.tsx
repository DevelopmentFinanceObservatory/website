'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import ArtifactFields, { evergreenOutcome, isComplete, type Refusals } from './ArtifactFields';
import styles from './EditArtifact.module.scss';
import EvergreenWarnings from './EvergreenWarnings';
import ReplacementPicker from './ReplacementPicker';

import Button from '@/components/atoms/Button/Button';
import Modal from '@/components/molecules/Modal/Modal';
import { artifactPath, type LibraryArtifact, type ReplacementChoice } from '@/lib/library/artifact';
import {
    deleteArtifact,
    differingFields,
    editArtifact,
    type EvergreenWarning,
    isArtifactChangedRefusal,
    loadStored,
    readEvergreenWarnings,
    readLatest,
    readRevision,
    type StoredText,
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
 *
 * An edit someone else's save overtook keeps the draft, names the fields
 * where the latest version differs, and saves the draft over it or takes it.
 * Closing the dialog keeps an unsaved draft for the next opening, and Cancel
 * discards it. A save that answers after the dialog was closed leaves the
 * dialog shut and says how it went under the Edit button.
 */

const FIELD_LABEL: Record<keyof ArtifactText, string> = {
    title: 'Title',
    description: 'Description',
    topics: 'Topics',
    contentTitle: 'Content title',
    content: 'Content',
};

const NAMES = new Intl.ListFormat('en-GB', { style: 'long', type: 'conjunction' });

// What a save that answered after the dialog was closed did.
type Notice = { saved: true; warnings: EvergreenWarning[] } | { saved: false; changed: boolean };

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
    const deleteRef = useRef<HTMLElement>(null);
    const formRef = useRef<HTMLFormElement>(null);
    // Whether the dialog is open, read when a save answers.
    const openRef = useRef(false);
    const [text, setText] = useState(() => textOf(artifact));
    // The revision the next save is made from. A save moves the row on, and
    // the page's own copy follows only once its refresh lands.
    const [revision, setRevision] = useState(artifact.revision);
    // The latest stored text this dialog knows of, from its own save or a
    // refusal of one, for a reopening before the page's refresh lands.
    const [saved, setSaved] = useState<StoredText | null>(null);
    // The stored text the draft started from, which tells an unsaved draft.
    const [draftFrom, setDraftFrom] = useState(() => textOf(artifact));
    const [busy, setBusy] = useState<'save' | 'load' | 'delete' | null>(null);
    const [confirming, setConfirming] = useState(false);
    const [replacedBy, setReplacedBy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [refusals, setRefusals] = useState<Refusals | null>(null);
    // The latest version, when the edit answered that someone else saved the
    // artifact first, or `unknown` when the answer carried none that reads.
    const [conflict, setConflict] = useState<StoredText | 'unknown' | null>(null);
    // The sentences a saved edit flagged, shown until the dialog is closed.
    const [warnings, setWarnings] = useState<EvergreenWarning[] | null>(null);
    const [notice, setNotice] = useState<Notice | null>(null);

    const place = (next: boolean) => {
        openRef.current = next;
        setOpen(next);
    };

    // The newest stored text known: this dialog's own, or the page's once
    // its refresh lands.
    const newest = (): StoredText =>
        saved && saved.revision > artifact.revision
            ? saved
            : { text: textOf(artifact), revision: artifact.revision };

    const startFrom = (base: StoredText) => {
        setText(base.text);
        setDraftFrom(base.text);
        setRevision(base.revision);
        setError(null);
        setRefusals(null);
        setConflict(null);
    };

    const show = (next: boolean) => {
        if (next) {
            const unsaved =
                busy === 'save' ||
                conflict !== null ||
                error !== null ||
                refusals !== null ||
                differingFields(text, draftFrom).length > 0;

            // An unsaved draft, a save still out and their messages stay.
            if (!unsaved) {
                startFrom(newest());
            }

            setNotice(null);
            setConfirming(false);
            setReplacedBy(null);
            setWarnings(null);
        }

        place(next);
    };

    // Cancel: the draft goes, and the next opening starts from the stored text.
    const discard = () => {
        startFrom(newest());
        setConfirming(false);
        setReplacedBy(null);
        place(false);
    };

    const submit = async (from: number) => {
        if (busy || !isComplete(text)) {
            return;
        }

        // A conflict stays on show while its draft is saved, so the button
        // pressed stays where focus is.
        setBusy('save');
        setError(null);
        setRefusals(null);

        const answer = await editArtifact(artifact.id, text, from);
        const shown = openRef.current;

        setBusy(null);

        if (answer.ok) {
            const flagged = readEvergreenWarnings(answer.value);
            const next = readRevision(answer.value);

            setConflict(null);
            setDraftFrom(text);

            if (next !== null) {
                setRevision(next);
                setSaved({ text, revision: next });
            }

            // The page behind shows the saved text; flagged sentences keep
            // the dialog open so they are read.
            router.refresh();

            if (shown) {
                place(flagged.length > 0);
                setWarnings(flagged.length > 0 ? flagged : null);
            } else {
                setNotice({ saved: true, warnings: flagged });
            }

            return;
        }

        const changed = isArtifactChangedRefusal(answer.problem);
        const latest = readLatest(answer.problem);

        if (changed) {
            // Save stays shut until the draft is compared with the latest
            // version, so a stale revision is never sent again.
            setConflict(latest ?? 'unknown');
            router.refresh();

            if (latest) {
                learn(latest);
            }
        } else {
            const outcome = evergreenOutcome(answer.problem, answer.detail, text);

            setRefusals(outcome.refusals);
            setError(outcome.error);
        }

        if (!shown) {
            setNotice({ saved: false, changed });
        }
    };

    const learn = (latest: StoredText) =>
        setSaved((known) => (known && known.revision >= latest.revision ? known : latest));

    // The latest version, for a conflict whose answer carried none.
    const loadLatest = async () => {
        setBusy('load');
        setError(null);

        const answer = await loadStored(artifact.id);

        setBusy(null);

        if (answer.ok) {
            setConflict(answer.value);
            learn(answer.value);
        } else {
            setError(answer.detail);
        }
    };

    const save = (event: React.FormEvent) => {
        event.preventDefault();
        void submit(revision);
    };

    // The draft goes over the latest version, saved from its revision.
    const keepDraft = (latest: StoredText) => {
        setRevision(latest.revision);
        void submit(latest.revision);
    };

    // The draft gives way to the latest version, which the next save starts from.
    const takeLatest = (latest: StoredText) => {
        startFrom(latest);
        queueMicrotask(() => formRef.current?.querySelector('input')?.focus());
    };

    const differing =
        conflict && conflict !== 'unknown' ? differingFields(text, conflict.text) : [];

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
            <div className={styles.edit}>
                <Button variant="bordered" full icon="edit" onClick={() => show(true)}>
                    Edit
                </Button>
                {/* In the page from the start, so a save that answers after the
                    dialog was closed is announced. */}
                <div className={styles.notice} role="status">
                    {notice?.saved && (
                        <>
                            <p>The changes were saved.</p>
                            {notice.warnings.length > 0 && (
                                <EvergreenWarnings warnings={notice.warnings} />
                            )}
                        </>
                    )}
                    {notice && !notice.saved && (
                        <p className={styles.error}>
                            {notice.changed
                                ? 'The changes were not saved: someone else changed this artifact. Open Edit to compare your draft with their version.'
                                : 'The changes were not saved. Open Edit to see why.'}
                        </p>
                    )}
                </div>
            </div>
            <Modal open={open} onOpenChange={show} title="Edit" fit initialFocus="form input">
                {/* Mounted in both views, so the saved message is announced as
                    it appears. */}
                <div role="status">
                    {warnings && (
                        <>
                            <p>The changes were saved.</p>
                            <EvergreenWarnings warnings={warnings} />
                        </>
                    )}
                </div>
                {warnings ? (
                    <div className={styles.form}>
                        {/* The form that held focus is replaced, so focus moves here. */}
                        <Button variant="dark" full autoFocus onClick={() => show(false)}>
                            Done
                        </Button>
                    </div>
                ) : (
                    <form ref={formRef} className={styles.form} onSubmit={save}>
                        <ArtifactFields value={text} onChange={setText} refusals={refusals} />
                        {conflict === 'unknown' && (
                            <div className={styles.conflict} role="alert">
                                <p>
                                    Someone else saved this artifact while you were editing it. Load
                                    their version to compare it with your draft.
                                </p>
                                <Button
                                    variant="bordered"
                                    full
                                    onClick={() => void loadLatest()}
                                    disabled={busy !== null}
                                >
                                    {busy === 'load' ? 'Loading…' : 'Load Their Version'}
                                </Button>
                            </div>
                        )}
                        {conflict && conflict !== 'unknown' && (
                            <div className={styles.conflict} role="alert">
                                <p>
                                    Someone else saved this artifact while you were editing it.{' '}
                                    {differing.length > 0
                                        ? `Their version differs from your draft in ${NAMES.format(differing.map((field) => FIELD_LABEL[field]))}.`
                                        : 'Their version matches your draft.'}
                                </p>
                                <Button
                                    variant="bordered"
                                    full
                                    onClick={() => keepDraft(conflict)}
                                    disabled={busy !== null || !isComplete(text)}
                                >
                                    {busy === 'save' ? 'Saving…' : 'Save Your Draft Over It'}
                                </Button>
                                <Button
                                    variant="bordered"
                                    full
                                    onClick={() => takeLatest(conflict)}
                                    disabled={busy !== null}
                                >
                                    Use Their Version
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
                                disabled={busy !== null || conflict !== null || !isComplete(text)}
                            >
                                {busy === 'save' ? 'Saving…' : 'Save Changes'}
                            </Button>
                            <Button
                                variant="bordered"
                                full
                                onClick={discard}
                                disabled={busy !== null}
                            >
                                Cancel
                            </Button>
                            {confirming ? (
                                <>
                                    {/* In the place of "Delete from Library", so a
                                    second click of a double-click keeps it. */}
                                    <Button
                                        variant="bordered"
                                        full
                                        autoFocus
                                        onClick={() => {
                                            setConfirming(false);
                                            // The question's buttons leave the page, so
                                            // focus goes back to the one that asked it.
                                            queueMicrotask(() => deleteRef.current?.focus());
                                        }}
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
                                    ref={deleteRef}
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
