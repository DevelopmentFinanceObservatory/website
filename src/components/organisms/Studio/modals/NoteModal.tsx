'use client';

import { useState } from 'react';

import styles from './TextCardModal.module.scss';

import Button from '@/components/atoms/Button/Button';
import Modal from '@/components/molecules/Modal/Modal';

/**
 * A user's note on a data card (menu → Add Note / Edit Note): one text
 * field, Reset clears it, Save commits. Keyed by the parent per opening so
 * the field starts from the current note.
 */
const NoteModal = ({
    open,
    onOpenChange,
    initial,
    onSubmit,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initial?: string;
    onSubmit: (note: string) => void;
}) => {
    const [note, setNote] = useState(initial ?? '');
    const canSave = note.trim().length > 0;

    const submit = (event: React.FormEvent) => {
        event.preventDefault();

        if (!canSave) {
            return;
        }

        onSubmit(note.trim());
        onOpenChange(false);
    };

    return (
        <Modal
            open={open}
            onOpenChange={onOpenChange}
            title={initial ? 'Edit Note' : 'Add Note'}
            fit
            actions={
                <Button variant="paper" onClick={() => setNote('')}>
                    Reset
                </Button>
            }
        >
            <form className={styles.form} onSubmit={submit}>
                <label className={styles.field}>
                    <span className={styles.label}>Note</span>
                    <textarea
                        className={styles.textarea}
                        value={note}
                        placeholder="Enter note…"
                        rows={4}
                        autoFocus
                        onChange={(event) => setNote(event.target.value)}
                    />
                </label>
                <div className={styles.actions}>
                    <Button variant="dark" wide icon="arrow" type="submit" disabled={!canSave}>
                        {initial ? 'Save Changes' : 'Add Note'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

export default NoteModal;
