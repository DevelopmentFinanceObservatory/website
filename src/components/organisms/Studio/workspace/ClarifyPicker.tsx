import { useId, useState } from 'react';

import styles from './ChatPanel.module.scss';
import type { ChatState } from '../hooks/useChat';

import Button from '@/components/atoms/Button/Button';

type ClarifyPickerProps = {
    clarify: NonNullable<ChatState['clarify']>;
    onChoose: (id: string) => void;
    onAnswer: (text: string) => void;
    onSkip: () => void;
};

// A clarify turn replaces the input with a picker card until it's answered
// or skipped. It renders only the controls the frame declares: options
// when there are any, free text when `clarify.showText` says so, Skip when
// the frame permits skipping. `showText` is derived in clarify.ts, which
// guarantees at least one control renders even when the frame offers no
// options and no skip.
const ClarifyPicker = ({ clarify, onChoose, onAnswer, onSkip }: ClarifyPickerProps) => {
    const [text, setText] = useState('');
    const questionId = useId();

    const submitText = () => {
        const trimmed = text.trim();

        if (!trimmed) {
            return;
        }

        onAnswer(trimmed);
        setText('');
    };

    return (
        <div className={styles.picker}>
            <div className={styles.pickerHead}>
                <p id={questionId} className={styles.pickerQuestion}>
                    {clarify.question}
                </p>
                {clarify.progress && (
                    <span className={styles.pickerCount}>
                        {clarify.progress.completed}/{clarify.progress.total}
                    </span>
                )}
            </div>
            {clarify.options.length > 0 && (
                <div className={styles.pickerOptions}>
                    {clarify.options.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            className={styles.pickerOption}
                            onClick={() => onChoose(option.id)}
                        >
                            <span className={styles.pickerOptionLabel}>
                                {option.label}
                                {option.recommended && (
                                    <span className={styles.pickerOptionBadge}>Recommended</span>
                                )}
                            </span>
                            {option.description && (
                                <span className={styles.pickerOptionDescription}>
                                    {option.description}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}
            {clarify.rationale && <p className={styles.pickerRationale}>{clarify.rationale}</p>}
            {clarify.showText && (
                <form
                    className={styles.pickerText}
                    onSubmit={(event) => {
                        event.preventDefault();
                        submitText();
                    }}
                >
                    <input
                        className={styles.pickerTextInput}
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        placeholder="Type your answer..."
                        aria-labelledby={questionId}
                    />
                    <Button
                        type="submit"
                        variant="dark"
                        small
                        className={styles.pickerTextSubmit}
                        disabled={!text.trim()}
                    >
                        Send
                    </Button>
                </form>
            )}
            {clarify.skippable && (
                <Button variant="bordered" className={styles.pickerSkip} onClick={onSkip}>
                    Skip
                </Button>
            )}
        </div>
    );
};

export default ClarifyPicker;
