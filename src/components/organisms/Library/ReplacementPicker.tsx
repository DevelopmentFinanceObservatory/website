'use client';

import { useState } from 'react';

import fields from './ArtifactFields.module.scss';
import styles from './ReplacementPicker.module.scss';

import Button from '@/components/atoms/Button/Button';
import type { ReplacementChoice } from '@/lib/library/artifact';

// How many titles the picker lists for one search.
const SHOWN = 6;

const fold = (text: string): string => text.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The optional pick of the artifact a withdrawn one's address links to: a
 * search over the titles of the artifacts on show, and the matches as chips.
 * The picked one stays listed first, and a second press unpicks it.
 */
const ReplacementPicker = ({
    choices,
    value,
    onChange,
    disabled = false,
}: {
    choices: readonly ReplacementChoice[];
    value: string | null;
    onChange: (id: string | null) => void;
    disabled?: boolean;
}) => {
    const [query, setQuery] = useState('');
    const needle = fold(query);
    const picked = choices.find((choice) => choice.id === value);
    const matches = choices
        .filter((choice) => choice.id !== value && fold(choice.title).includes(needle))
        .slice(0, SHOWN);

    return (
        <fieldset className={fields.field} disabled={disabled}>
            <legend className={fields.label}>Replaced By (Optional)</legend>
            <input
                type="search"
                aria-label="Search the Library by title"
                className={fields.input}
                value={query}
                placeholder="Search by title…"
                onChange={(event) => setQuery(event.target.value)}
                // Enter leaves the dialog's form alone.
                onKeyDown={(event) => event.key === 'Enter' && event.preventDefault()}
            />
            <div className={styles.choices}>
                {[...(picked ? [picked] : []), ...matches].map((choice) => (
                    <Button
                        key={choice.id}
                        variant="chip"
                        aria-pressed={choice.id === value}
                        onClick={() => onChange(choice.id === value ? null : choice.id)}
                    >
                        {choice.title}
                    </Button>
                ))}
                {!picked && matches.length === 0 && (
                    <p className={styles.empty}>No published artifact has that title.</p>
                )}
            </div>
        </fieldset>
    );
};

export default ReplacementPicker;
