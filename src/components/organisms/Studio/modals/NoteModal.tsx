'use client';

import * as Popover from '@radix-ui/react-popover';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import styles from './NoteModal.module.scss';
import formStyles from './TextCardModal.module.scss';

import Button from '@/components/atoms/Button/Button';
import Icon from '@/components/atoms/Icon/Icon';
import Modal from '@/components/molecules/Modal/Modal';
import { linkable, linkTarget, type NotePart, noteParts, noteText } from '@/lib/studio/noteLinks';

// The field's content built from a note's runs as text nodes and links. The
// note's own text is set as text, so no markup in it is parsed.
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

// A line break the browser writes as an element: a <br>, or a block per line.
const BREAKS = 'br, div, p';
const BLOCKS = new Set(['DIV', 'P']);

// The link a node of the field sits in, or null.
const linkOf = (node: Node): Element | null =>
    (node instanceof Element ? node : node.parentElement)?.closest('a') ?? null;

// The words selected in `field` as a range, or null when they cannot be one
// link. That is no selection, one outside the field, words across a line
// break or holding a bracket, and words that take in part of a link or a
// whole link with text beside it.

const pickOf = (field: HTMLElement | null): Range | null => {
    const selection = document.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;

    return range &&
        field &&
        !range.collapsed &&
        field.contains(range.commonAncestorContainer) &&
        linkable(range.toString()) &&
        !range.cloneContents().querySelector(BREAKS) &&
        linkOf(range.startContainer) === linkOf(range.endContainer) &&
        (linkOf(range.startContainer) !== null || !range.cloneContents().querySelector('a'))
        ? range.cloneRange()
        : null;
};

// The note read back from the field. A <br> is a newline, and so is the start
// of every block after the first. A <br> that is a block's only child holds
// an empty line open, so the block's own newline stands for it. Any other
// element, such as a <span> the browser inserts, reads as its contents. A
// link keeps its target only while that is an http(s) URL and its words can
// be one link (linkable). One that cannot keeps its words and line breaks.
const read = (node: Node): NotePart[] =>
    [...node.childNodes].flatMap((child, index): NotePart[] => {
        if (child.nodeType === Node.TEXT_NODE) {
            return [{ text: child.textContent ?? '' }];
        }

        if (!(child instanceof HTMLElement)) {
            return [];
        }

        if (child.tagName === 'BR') {
            return BLOCKS.has(node.nodeName) && node.childNodes.length === 1
                ? []
                : [{ text: '\n' }];
        }

        if (child.tagName === 'A') {
            const text = child.textContent ?? '';
            const href = linkTarget(child.getAttribute('href') ?? '');

            return href && linkable(text) && !child.querySelector(BREAKS)
                ? [{ text, href }]
                : read(child);
        }

        return [
            ...(BLOCKS.has(child.tagName) && index > 0 ? [{ text: '\n' }] : []),
            ...read(child),
        ];
    });

// The shortcut that opens the URL panel: ⌘K on Apple systems and Ctrl+K
// elsewhere, matched on the letter typed. Ctrl+K on a Mac deletes to the end
// of the line, and a combination with Alt types a character, so both pass
// through. A layout whose K key types no Latin letter, such as Cyrillic,
// matches on the physical K key instead.
const isLinkShortcut = (event: React.KeyboardEvent) => {
    const key = event.key.toLowerCase();
    const apple = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
    const modifier = apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;

    return (
        modifier &&
        !event.altKey &&
        (key === 'k' || (!/^[a-z]$/.test(key) && event.code === 'KeyK'))
    );
};

// Puts the caret at the end of the field's text.
const caretToEnd = (field: HTMLElement) => {
    const range = document.createRange();

    range.selectNodeContents(field);
    range.collapse(false);
    field.focus();
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
};

/**
 * A user's note on a data card (menu → Add Note / Edit Note). Selecting
 * words in the field offers a Link control over them, which opens a URL
 * panel, and Apply makes the words a link. ⌘K or Ctrl+K opens the panel from
 * the keyboard. Remove deletes the note. Keyed by the parent per opening so
 * the field starts from the current note.
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
    // The note as the dialog opened on it. The title and actions read it, so
    // they hold still while the dialog closes after Remove.
    const [opened] = useState(initial);
    // The words selected in the field, which the Link control and the URL
    // panel stand over.
    const [pick, setPick] = useState<Range | null>(null);
    const [asking, setAsking] = useState(false);
    const [url, setUrl] = useState('');
    const [urlInvalid, setUrlInvalid] = useState(false);
    const fieldRef = useRef<HTMLDivElement | null>(null);
    // The words the URL panel opened over, given back to the field when the
    // panel closes without Apply.
    const askedRef = useRef<Range | null>(null);
    const labelId = useId();
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
            requestAnimationFrame(() => caretToEnd(field));
        },
        [initial],
    );

    // A selection of words inside the field offers the Link control.
    useEffect(() => {
        if (asking) {
            return;
        }

        const onChange = () => setPick(pickOf(fieldRef.current));

        document.addEventListener('selectionchange', onChange);

        return () => document.removeEventListener('selectionchange', onChange);
    }, [asking]);

    const openAsk = (words: Range) => {
        askedRef.current = words.cloneRange();
        setAsking(true);
    };

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
        let link: HTMLAnchorElement;

        // Words inside a link change its target, and any other words
        // become a link of their own.
        if (inside && field.contains(inside)) {
            link = inside;
            link.href = href;
        } else {
            link = document.createElement('a');
            link.href = href;
            link.textContent = range.toString();
            range.deleteContents();
            range.insertNode(link);
        }

        askedRef.current = null;
        field.normalize();
        setNote(noteText(read(field)));
        setPick(null);
        closeAsk();

        // The caret goes back to the field just after the link, where the
        // reader left off.
        const caret = document.createRange();

        field.focus();
        caret.setStartAfter(link);
        caret.collapse(true);
        document.getSelection()?.removeAllRanges();
        document.getSelection()?.addRange(caret);
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
            title={opened ? 'Edit Note' : 'Add Note'}
            fit
            actions={
                opened ? (
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
                    {/* The field is a contenteditable <div>, which a <label>
                        cannot point at, so the heading focuses it by hand. */}
                    <span
                        id={labelId}
                        className={formStyles.label}
                        onClick={() => fieldRef.current && caretToEnd(fieldRef.current)}
                    >
                        Note
                    </span>
                    <div
                        ref={setField}
                        className={styles.editor}
                        contentEditable="plaintext-only"
                        suppressContentEditableWarning
                        role="textbox"
                        aria-multiline="true"
                        aria-labelledby={labelId}
                        aria-placeholder="Enter note…"
                        // The placeholder sits in front of the first line, so
                        // it shows only while the field holds nothing at all,
                        // spaces and line breaks included.
                        data-empty={note === '' ? '' : undefined}
                        onInput={(event) => setNote(noteText(read(event.currentTarget)))}
                        onKeyDown={(event) => {
                            if (!isLinkShortcut(event)) {
                                return;
                            }

                            // Taken even with no words selected, since the
                            // browser's own Ctrl+K, and ⌘K in Firefox on a
                            // Mac, moves focus to its search bar, out of the
                            // dialog.
                            event.preventDefault();

                            // Read here, since a selection made a moment ago
                            // may not have reached `pick` yet.
                            const words = pickOf(fieldRef.current);

                            if (words) {
                                setPick(words);
                                openAsk(words);
                            }
                        }}
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
                                // The Link control leaves the caret and the
                                // selection in the field. The URL panel,
                                // opened straight from the shortcut, takes
                                // focus through Radix, which the dialog's
                                // focus trap lets through.
                                onOpenAutoFocus={(event) => {
                                    if (!asking) {
                                        event.preventDefault();
                                    }
                                }}
                                // Closing the URL panel without Apply (Escape)
                                // unmounts the focused input, which leaves
                                // focus on the page. The field takes it back
                                // with the words selected as before. Focus
                                // the reader moved elsewhere stays there.
                                onCloseAutoFocus={(event) => {
                                    event.preventDefault();

                                    const field = fieldRef.current;
                                    const words = askedRef.current;
                                    const active = document.activeElement;

                                    askedRef.current = null;

                                    if (field && words && (!active || active === document.body)) {
                                        field.focus();
                                        document.getSelection()?.removeAllRanges();
                                        document.getSelection()?.addRange(words);
                                    }
                                }}
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
                                        <Button variant="light" small onClick={applyLink}>
                                            Apply
                                        </Button>
                                    </>
                                ) : (
                                    <Button
                                        variant="dark"
                                        small
                                        icon="link"
                                        // Pressing it must not take the selection away.
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => pick && openAsk(pick)}
                                    >
                                        Link
                                    </Button>
                                )}
                            </Popover.Content>
                        </Popover.Portal>
                    </Popover.Root>
                    <p className={styles.hint}>
                        <Icon name="info" className={styles.hintIcon} />
                        Select words, then press ⌘K / Ctrl+K or Link
                    </p>
                </div>
                <div className={formStyles.actions}>
                    <Button variant="dark" wide icon="arrow" type="submit" disabled={!canSave}>
                        {opened ? 'Update Note' : 'Add Note'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

export default NoteModal;
