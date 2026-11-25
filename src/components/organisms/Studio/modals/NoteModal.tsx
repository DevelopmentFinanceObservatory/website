'use client';

import * as Popover from '@radix-ui/react-popover';
import { useCallback, useEffect, useRef, useState } from 'react';

import styles from './NoteModal.module.scss';
import formStyles from './TextCardModal.module.scss';

import Button from '@/components/atoms/Button/Button';
import Icon from '@/components/atoms/Icon/Icon';
import Modal from '@/components/molecules/Modal/Modal';
import { linkTarget, type NotePart, noteParts, noteText } from '@/lib/studio/noteLinks';

// The field's content built from a note: text nodes and links, never markup
// parsed from the note itself.
const fill = (field: HTMLElement, note: string) =>
    field.replaceChildren(
        ...noteParts(note).map((part) => {
            if (!part.href) {
                return document.createTextNode(part.text);
            }

            const link = document.createElement('a');

            link.href = part.href;
            link.textContent = part.text;

            return link;
        }),
    );

// The note read back from the field. A line break the browser writes as an
// element (a <br>, or a <div> per line) is a newline, and a link keeps its
// target only while that is an http(s) URL with words to it.
const read = (node: Node): NotePart[] =>
    [...node.childNodes].flatMap((child, index): NotePart[] => {
        if (child.nodeType === Node.TEXT_NODE) {
            return [{ text: child.textContent ?? '' }];
        }

        if (!(child instanceof HTMLElement)) {
            return [];
        }

        if (child.tagName === 'BR') {
            return [{ text: '\n' }];
        }

        if (child.tagName === 'A') {
            const text = child.textContent ?? '';
            const href = linkTarget(child.getAttribute('href') ?? '');

            return text && href && !/[\n\]]/.test(text) ? [{ text, href }] : [{ text }];
        }

        return [...(index > 0 ? [{ text: '\n' }] : []), ...read(child)];
    });

/**
 * A user's note on a data card (menu → Add Note / Edit Note). Selecting
 * words in the field offers a link on them: the Link control opens a URL
 * panel, and Apply makes the words a link. Remove deletes the note. Keyed by
 * the parent per opening so the field starts from the current note.
 */
const NoteModal = ({
    open,
    onOpenChange,
    initial,
    onSubmit,
    onRemove,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initial?: string;
    onSubmit: (note: string) => void;
    onRemove: () => void;
}) => {
    const [note, setNote] = useState(initial ?? '');
    // The words selected in the field, which the Link control and the URL
    // panel stand over.
    const [pick, setPick] = useState<Range | null>(null);
    const [asking, setAsking] = useState(false);
    const [url, setUrl] = useState('');
    const [urlInvalid, setUrlInvalid] = useState(false);
    const fieldRef = useRef<HTMLDivElement | null>(null);
    const canSave = note.trim().length > 0;

    // The field fills once, as it mounts, and takes the caret at the end of
    // the text a frame later, after the dialog's own focus work (see
    // useOpenFocus).
    const setField = useCallback(
        (field: HTMLDivElement | null) => {
            if (!field || fieldRef.current === field) {
                return;
            }

            fieldRef.current = field;
            fill(field, initial ?? '');
            requestAnimationFrame(() => {
                const range = document.createRange();

                range.selectNodeContents(field);
                range.collapse(false);
                field.focus();
                document.getSelection()?.removeAllRanges();
                document.getSelection()?.addRange(range);
            });
        },
        [initial],
    );

    // A selection of words inside the field offers the Link control. Words
    // across a line break, or holding "]", cannot be one link.
    useEffect(() => {
        if (asking) {
            return;
        }

        const onChange = () => {
            const selection = document.getSelection();
            const field = fieldRef.current;
            const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
            const text = range?.toString() ?? '';

            if (
                !range ||
                !field ||
                range.collapsed ||
                !field.contains(range.commonAncestorContainer) ||
                !text.trim() ||
                /[\n\]]/.test(text)
            ) {
                setPick(null);

                return;
            }

            setPick(range.cloneRange());
        };

        document.addEventListener('selectionchange', onChange);

        return () => document.removeEventListener('selectionchange', onChange);
    }, [asking]);

    const closeAsk = () => {
        setAsking(false);
        setUrl('');
        setUrlInvalid(false);
    };

    const applyLink = () => {
        const field = fieldRef.current;
        const href = linkTarget(url);

        if (!href) {
            setUrlInvalid(true);

            return;
        }

        if (!pick || !field) {
            return;
        }

        const range = pick;
        const start = range.commonAncestorContainer;
        const inside = (start instanceof Element ? start : start.parentElement)?.closest('a');

        // Words inside a link change its target, and any other words
        // become a link of their own.
        if (inside && field.contains(inside)) {
            inside.href = href;
        } else {
            const link = document.createElement('a');

            link.href = href;
            link.textContent = range.toString();
            range.deleteContents();
            range.insertNode(link);
        }

        field.normalize();
        setNote(noteText(read(field)));
        setPick(null);
        closeAsk();
        field.focus();
        document.getSelection()?.collapseToEnd();
    };

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
                initial ? (
                    <Button
                        variant="paper"
                        onClick={() => {
                            onRemove();
                            onOpenChange(false);
                        }}
                    >
                        Remove
                    </Button>
                ) : undefined
            }
        >
            <form className={formStyles.form} onSubmit={submit}>
                <div className={formStyles.field}>
                    <span id="note-label" className={formStyles.label}>
                        Note
                    </span>
                    <div
                        ref={setField}
                        className={styles.editor}
                        contentEditable="plaintext-only"
                        suppressContentEditableWarning
                        role="textbox"
                        aria-multiline="true"
                        aria-labelledby="note-label"
                        aria-placeholder="Enter note…"
                        data-empty={note === '' ? '' : undefined}
                        onInput={(event) => setNote(noteText(read(event.currentTarget)))}
                    />
                    {/* Portalled over the dialog, which clips its own body. */}
                    <Popover.Root
                        open={!!pick}
                        onOpenChange={(next) => {
                            if (!next) {
                                setPick(null);
                                closeAsk();
                            }
                        }}
                    >
                        {pick && (
                            <Popover.Anchor
                                virtualRef={{
                                    current: {
                                        getBoundingClientRect: () => pick.getBoundingClientRect(),
                                    },
                                }}
                            />
                        )}
                        <Popover.Portal>
                            <Popover.Content
                                className={asking ? styles.linkPanel : styles.linkControl}
                                side="top"
                                align="center"
                                sideOffset={6}
                                collisionPadding={16}
                                // The control leaves the caret and the
                                // selection in the field.
                                onOpenAutoFocus={(event) => event.preventDefault()}
                                onCloseAutoFocus={(event) => event.preventDefault()}
                            >
                                {asking ? (
                                    <>
                                        <label className={styles.linkLabel}>
                                            Link URL
                                            <input
                                                autoFocus
                                                className={styles.linkInput}
                                                type="url"
                                                inputMode="url"
                                                placeholder="http://…"
                                                value={url}
                                                aria-invalid={urlInvalid || undefined}
                                                onChange={(event) => {
                                                    setUrl(event.target.value);
                                                    setUrlInvalid(false);
                                                }}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter') {
                                                        event.preventDefault();
                                                        applyLink();
                                                    }
                                                }}
                                            />
                                        </label>
                                        <button
                                            type="button"
                                            className={styles.linkApply}
                                            onClick={applyLink}
                                        >
                                            Apply
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        type="button"
                                        className={styles.linkButton}
                                        // Pressing it must not take the selection away.
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => setAsking(true)}
                                    >
                                        <Icon name="link" className={styles.linkIcon} />
                                        Link
                                    </button>
                                )}
                            </Popover.Content>
                        </Popover.Portal>
                    </Popover.Root>
                    <p className={styles.hint}>
                        <Icon name="info" className={styles.hintIcon} />
                        Select text to add a link
                    </p>
                </div>
                <div className={formStyles.actions}>
                    <Button variant="dark" wide icon="arrow" type="submit" disabled={!canSave}>
                        {initial ? 'Update Note' : 'Add Note'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

export default NoteModal;
