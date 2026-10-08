'use client';

import { useState } from 'react';

import styles from './TextCardModal.module.scss';

import { useOpenFocus } from './useOpenFocus';

import Button from '@/components/atoms/Button/Button';
import Modal from '@/components/molecules/Modal/Modal';

/**
 * Rename a card (menu → Edit Title): one field, Reset restores the card's
 * original title, Save Changes commits. Keyed by the parent per opening so
 * the field starts from the current title.
 */
const EditTitleModal = ({
    open,
    onOpenChange,
    current,
    original,
    onSubmit,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    // The title as shown now (a rename or the widget's own).
    current: string;
    // The widget's own title — Reset goes back to it.
    original: string;
    onSubmit: (title: string) => void;
}) => {
    const [title, setTitle] = useState(current);
    const field = useOpenFocus<HTMLTextAreaElement>(open);
    const canSave = title.trim().length > 0;

    const submit = (event: React.FormEvent) => {
        event.preventDefault();

        if (!canSave) {
            return;
        }

        onSubmit(title.trim());
        onOpenChange(false);
    };

    return (
        <Modal
            open={open}
            onOpenChange={onOpenChange}
            title="Edit Title"
            fit
            actions={
                <Button variant="paper" onClick={() => setTitle(original)}>
                    Reset
                </Button>
            }
        >
            <form className={styles.form} onSubmit={submit}>
                <label className={styles.field}>
                    <span className={styles.label}>Title</span>
                    {/* A wrapping textarea (long titles stay fully visible,
                        no horizontal scroll); Enter saves, Shift+Enter is a
                        newline-free no-op — titles are single-line. */}
                    <textarea
                        ref={field}
                        className={styles.titleArea}
                        value={title}
                        placeholder="Enter title…"
                        rows={2}
                        onChange={(event) => setTitle(event.target.value.replace(/\n/g, ' '))}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                submit(event);
                            }
                        }}
                    />
                </label>
                <div className={styles.actions}>
                    <Button variant="dark" wide icon="arrow" type="submit" disabled={!canSave}>
                        Save Changes
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

export default EditTitleModal;
