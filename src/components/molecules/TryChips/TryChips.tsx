'use client';

import classNames from 'classnames';

import styles from './TryChips.module.scss';

import { revealIndex } from '@/hooks/useReveal';

export type TryChipsProps = {
    examples: string[];
    // Runs the picked sentence.
    onPick: (text: string) => void;
    hidden?: boolean;
    className?: string;
};

// The bold "Try" label and example sentences as rounded chips, on the landing
// prompt and on the answers that hold no data. Colours ride on the
// --prompt-label and --prompt-chip-* tokens, as DataPrompt's do.
const TryChips = ({ examples, onPick, hidden, className }: TryChipsProps) => (
    <div
        className={classNames(styles.try, hidden && styles.tryHidden, className)}
        data-reveal-group="trigger"
    >
        <p className={styles.tryLabel} data-reveal="text" style={revealIndex(0)}>
            Try
        </p>
        <div className={styles.chips}>
            {examples.map((example, index) => (
                <button
                    key={example}
                    type="button"
                    className={styles.chip}
                    data-reveal="soft"
                    style={revealIndex(1 + index)}
                    onClick={() => onPick(example)}
                >
                    {example}
                </button>
            ))}
        </div>
    </div>
);

export default TryChips;
