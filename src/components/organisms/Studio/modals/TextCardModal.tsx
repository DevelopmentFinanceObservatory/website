'use client';

import { useState } from 'react';

import styles from './TextCardModal.module.scss';

import Button from '@/components/atoms/Button/Button';
import Modal from '@/components/molecules/Modal/Modal';

/**
 * The Text Card dialog: title + body, Reset (clears both) in the head, and
 * Add Text Card (or Save Changes when editing an existing card — the fields
 * arrive prefilled). The panel sizes to its content.
 */
type TextCardModalProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    // Prefill for edit mode; undefined = a fresh card.
    initial?: { title: string; body: string };
    onSubmit: (title: string, body: string) => void;
};

/**
 * The Text Card dialog: title + body, Reset in the head, and Add Text Card
 * (or Save Changes when editing an existing card — the fields arrive
 * prefilled). The panel sizes to its content. The parent keys this per
 * opening, so the fields initialise straight from the prefill.
 */
const TextCardModal = ({ open, onOpenChange, initial, onSubmit }: TextCardModalProps) => {
    const [title, setTitle] = useState(initial?.title ?? '');
    const [body, setBody] = useState(initial?.body ?? '');
    const canAdd = title.trim().length > 0 || body.trim().length > 0;

    const reset = () => {
        setTitle('');
        setBody('');
    };

    const submit = (event: React.FormEvent) => {
        event.preventDefault();

        if (!canAdd) {
            return;
        }

        onSubmit(title.trim(), body.trim());
        onOpenChange(false);
    };

    return (
        <Modal
            open={open}
            onOpenChange={onOpenChange}
            title="Text Card"
            fit
            actions={
                <Button variant="paper" onClick={reset}>
                    Reset
                </Button>
            }
        >
            <form className={styles.form} onSubmit={submit}>
                <label className={styles.field}>
                    <span className={styles.label}>Title</span>
                    <input
                        className={styles.input}
                        value={title}
                        placeholder="Enter title…"
                        onChange={(event) => setTitle(event.target.value)}
                    />
                </label>
                <label className={styles.field}>
                    <span className={styles.label}>Body text</span>
                    <textarea
                        className={styles.textarea}
                        value={body}
                        placeholder="Enter text…"
                        rows={4}
                        onChange={(event) => setBody(event.target.value)}
                    />
                </label>
                <div className={styles.actions}>
                    <Button variant="dark" wide icon="arrow" type="submit" disabled={!canAdd}>
                        {initial ? 'Save Changes' : 'Add Text Card'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

export default TextCardModal;
