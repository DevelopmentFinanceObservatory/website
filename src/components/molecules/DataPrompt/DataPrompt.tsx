'use client';

import classNames from 'classnames';
import { useEffect, useRef, useState } from 'react';

import styles from './DataPrompt.module.scss';

import TryChips from '@/components/molecules/TryChips/TryChips';
import { revealIndex } from '@/hooks/useReveal';

export type DataPromptProps = {
    suggestions?: string[];
    suggestionsHidden?: boolean;
    // `via` says whether the text was typed or a suggestion chip was picked.
    onSubmit?: (query: string, via: 'typed' | 'example') => void;
    onChange?: (query: string) => void;
    // Take the caret on mount. Applied from an effect rather than the DOM
    // attribute, so the decision can depend on the device without the server
    // and the browser rendering different markup.
    autoFocus?: boolean;
    // Focus the input whenever it scrolls into view (homepage section).
    focusOnView?: boolean;
    // Pre-filled text (a picked suggestion) — read once on mount; remount
    // with a fresh key to inject a new value.
    initial?: string;
};

// The "Describe your data..." ghost input with the caret bar and the optional
// "Try" suggestion chips (TryChips). Colors ride on tokens, so it works on light and dark
// sections alike (override --prompt-* on an ancestor to re-theme).
const DataPrompt = ({
    suggestions,
    suggestionsHidden,
    onSubmit,
    onChange,
    autoFocus,
    focusOnView,
    initial,
}: DataPromptProps) => {
    const [value, setValue] = useState(() => (initial ?? '').replace(/\s+/g, ' '));
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // One line at rest; grows only once the first line actually wraps,
    // capped at two lines (per design).
    useEffect(() => {
        const el = inputRef.current;

        if (!el) {
            return;
        }

        el.style.height = 'auto';
        const cs = getComputedStyle(el);
        const line = parseFloat(cs.lineHeight) || el.scrollHeight;
        const padding = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);

        el.style.height = `${Math.min(el.scrollHeight, line * 2 + padding)}px`;
    }, [value]);

    useEffect(() => {
        const input = inputRef.current;

        if (!focusOnView || !input) {
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        input.focus({ preventScroll: true });
                    }
                });
            },
            { threshold: 0.5 },
        );

        observer.observe(input);

        return () => observer.disconnect();
    }, [focusOnView]);

    useEffect(() => {
        if (autoFocus) {
            inputRef.current?.focus({ preventScroll: true });
        }
        // Mount only: a later flip of the prop is a different prompt, which
        // arrives through a remount (see DataSearch's promptEpoch).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const submit = (query: string, via: 'typed' | 'example' = 'typed') => {
        if (query.trim()) {
            onSubmit?.(query.trim(), via);
        }
    };

    return (
        <>
            <form
                className={classNames(styles.search, value && styles.searchFilled)}
                data-reveal="text"
                style={revealIndex(0)}
                onSubmit={(event) => {
                    event.preventDefault();
                    submit(value);
                }}
            >
                <textarea
                    ref={inputRef}
                    rows={1}
                    className={styles.input}
                    placeholder="Describe your data..."
                    aria-label="Describe your data"
                    value={value}
                    onChange={(event) => {
                        // One-line queries in plain spaces only: pasted line
                        // breaks (and Shift+Enter) become spaces — a newline
                        // wraps the sentence with half the width still free —
                        // and NBSPs (riding in with pasted/prefilled copy)
                        // glue words into fake long tokens that wrap early.
                        const next = event.target.value
                            .replace(/\s*\n\s*/g, ' ')
                            .replace(/\u00a0/g, ' ');
                        setValue(next);
                        onChange?.(next);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            submit(value);
                        }
                    }}
                />
            </form>
            <span className={styles.rule} aria-hidden="true" />
            {suggestions && suggestions.length > 0 && (
                <TryChips
                    examples={suggestions}
                    onPick={(text) => submit(text, 'example')}
                    hidden={suggestionsHidden}
                    className={styles.try}
                />
            )}
        </>
    );
};

export default DataPrompt;
