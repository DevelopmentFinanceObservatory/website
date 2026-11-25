import classNames from 'classnames';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

import styles from './ChatPanel.module.scss';
import UnitChoice from './UnitChoice';
import type { ChatState } from '../hooks/useChat';
import CharCount from '../prompt/CharCount';

import {
    multiAnswer,
    type Clarify,
    type ClarifyAnswers,
    type ClarifyOption,
    type ClarifyQuestion,
} from '@/lib/studio/clarify';
import {
    answerText,
    arrowTarget,
    digitPick,
    railLabel,
    recordAnswer,
    reopen,
    startStepper,
    stepperAnswers,
    stepperRail,
    tabStopId,
    type Stepper,
} from '@/lib/studio/clarifyStepper';
import { interruptTextCount } from '@/lib/studio/interruptText';
import { unitAnswer } from '@/lib/studio/unitChoice';
import type { ElicitationAnswer, UnitOffer } from '@/lib/studio/wire';

import Button from '@/components/atoms/Button/Button';

type ClarifyPickerProps = {
    clarify: NonNullable<ChatState['clarify']>;
    onAnswer: (answers: ClarifyAnswers) => void;
    onSkip: () => void;
};

// How long a clicked option stays marked before the next question opens.
const MARK_MS = 180;

const OptionContent = ({ option }: { option: ClarifyOption }) => (
    <>
        <span className={styles.pickerOptionLabel}>
            {option.label}
            {option.recommended && <span className={styles.pickerOptionBadge}>Recommended</span>}
        </span>
        {option.description && (
            <span className={styles.pickerOptionDescription}>{option.description}</span>
        )}
    </>
);

// The free-text answer field with its own Send. `onDraft` reports each
// edit, so a caller that remounts the field can keep what was typed.
const TextAnswer = ({
    labelledBy,
    initial,
    ticked = false,
    onDraft,
    onSubmit,
}: {
    labelledBy: string;
    initial: string;
    // Ticked options let Send go with an empty box, and `onSubmit` then
    // gets an empty string.
    ticked?: boolean;
    onDraft?: (text: string) => void;
    onSubmit: (text: string) => void;
}) => {
    const [text, setText] = useState(initial);
    const count = interruptTextCount(text.trim());
    const countId = useId();

    return (
        <div className={styles.pickerTextWrap}>
            <form
                className={styles.pickerText}
                onSubmit={(event) => {
                    event.preventDefault();

                    const trimmed = text.trim();

                    if ((trimmed || ticked) && !count.over) {
                        onSubmit(trimmed);
                        setText('');
                    }
                }}
            >
                <input
                    className={styles.pickerTextInput}
                    value={text}
                    onChange={(event) => {
                        setText(event.target.value);
                        onDraft?.(event.target.value);
                    }}
                    placeholder="Type your answer..."
                    aria-labelledby={labelledBy}
                    aria-invalid={count.over || undefined}
                    aria-describedby={countId}
                />
                <Button
                    type="submit"
                    variant="dark"
                    small
                    className={styles.pickerTextSubmit}
                    disabled={(!text.trim() && !ticked) || count.over}
                >
                    Send
                </Button>
            </form>
            <CharCount id={countId} text={count} />
        </div>
    );
};

// The rows of a multi-select question, each toggling its own tick box.
const MultiOptions = ({
    question,
    ticked,
    labelledBy,
    onToggle,
}: {
    question: ClarifyQuestion;
    ticked: string[];
    labelledBy: string;
    onToggle: (optionId: string) => void;
}) => (
    <div className={styles.pickerOptions} role="group" aria-labelledby={labelledBy}>
        {question.options.map((option) => {
            const on = ticked.includes(option.id);

            return (
                <button
                    key={option.id}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    className={classNames(styles.pickerOption, on && styles.pickerOptionChosen)}
                    onClick={() => onToggle(option.id)}
                >
                    <span className={styles.pickerOptionRow}>
                        <span className={styles.pickerCheck} aria-hidden="true" />
                        <span className={styles.pickerOptionBody}>
                            <OptionContent option={option} />
                        </span>
                    </span>
                </button>
            );
        })}
    </div>
);

// The ticked ids after toggling `id`, in the question's option order.
const toggled = (question: ClarifyQuestion, ticked: string[], id: string): string[] =>
    question.options
        .map((option) => option.id)
        .filter((optionId) => (optionId === id ? !ticked.includes(id) : ticked.includes(optionId)));

// One question: a click answers the pause at once, and Skip dismisses the
// whole pause when the frame permits it. It renders only the controls the
// frame declares. `showText` is derived in clarify.ts, which guarantees at
// least one control renders even when the frame offers no options and no
// skip. A unit question shows the unit chips with Send. Its Skip skips the
// question when the question is skippable, else the whole pause. Either way
// the harness goes on with the chips' starting unit.
const OneQuestion = ({
    pause,
    question,
    onAnswer,
    onSkip,
}: {
    pause: Clarify;
    question: ClarifyQuestion;
    onAnswer: (answers: ClarifyAnswers) => void;
    onSkip: () => void;
}) => {
    const questionId = useId();
    const [ticked, setTicked] = useState<string[]>([]);
    const answer = (value: ElicitationAnswer) => onAnswer({ [question.id]: value });

    if (question.unit) {
        const skip = question.skippable
            ? () => answer({ kind: 'skipped' })
            : pause.skippable
              ? onSkip
              : undefined;

        return (
            <div className={styles.picker}>
                <div className={styles.pickerHead}>
                    <p id={questionId} className={styles.pickerQuestion}>
                        {question.question}
                    </p>
                    {pause.progress && (
                        <span className={styles.pickerCount}>
                            {pause.progress.completed}/{pause.progress.total}
                        </span>
                    )}
                </div>
                {question.rationale && (
                    <p className={styles.pickerRationale}>{question.rationale}</p>
                )}
                <UnitChoice
                    offer={question.unit}
                    onSend={(unit) => answer(unitAnswer(unit))}
                    onSkip={skip}
                />
            </div>
        );
    }

    return (
        <div className={styles.picker}>
            <div className={styles.pickerHead}>
                <p id={questionId} className={styles.pickerQuestion}>
                    {question.question}
                </p>
                {pause.progress && (
                    <span className={styles.pickerCount}>
                        {pause.progress.completed}/{pause.progress.total}
                    </span>
                )}
            </div>
            {question.multi && (
                <MultiOptions
                    question={question}
                    ticked={ticked}
                    labelledBy={questionId}
                    onToggle={(id) => setTicked((current) => toggled(question, current, id))}
                />
            )}
            {!question.multi && question.options.length > 0 && (
                <div className={styles.pickerOptions}>
                    {question.options.map((option) => (
                        <button
                            key={option.id}
                            type="button"
                            className={styles.pickerOption}
                            onClick={() => answer({ kind: 'option', option_id: option.id })}
                        >
                            <OptionContent option={option} />
                        </button>
                    ))}
                </div>
            )}
            {question.rationale && <p className={styles.pickerRationale}>{question.rationale}</p>}
            {question.showText && (
                <TextAnswer
                    labelledBy={questionId}
                    initial=""
                    ticked={question.multi && ticked.length > 0}
                    onSubmit={(text) =>
                        answer(
                            question.multi
                                ? multiAnswer(question, text, ticked)
                                : { kind: 'text', text },
                        )
                    }
                />
            )}
            {pause.skippable && (
                <Button variant="bordered" className={styles.pickerSkip} onClick={onSkip}>
                    Skip
                </Button>
            )}
        </div>
    );
};

// Answered questions on the dot rail; each row reopens its question.
const Rail = ({
    pause,
    stepper,
    indices,
    onChange,
}: {
    pause: Clarify;
    stepper: Stepper;
    indices: number[];
    onChange: (index: number) => void;
}) => {
    if (indices.length === 0) {
        return null;
    }

    return (
        <ol className={styles.pickerRail}>
            {indices.map((index) => {
                const question = pause.questions[index];
                const answer = question && stepper.answers[question.id];

                if (!question || !answer) {
                    return null;
                }

                return (
                    <li
                        key={question.id}
                        className={classNames(
                            styles.pickerRailItem,
                            answer.kind === 'skipped' && styles.pickerRailItemSkipped,
                        )}
                    >
                        <button
                            type="button"
                            className={styles.pickerRailRow}
                            aria-label={railLabel(question, answer)}
                            onClick={() => onChange(index)}
                        >
                            <span className={styles.pickerRailText}>
                                <span className={styles.pickerRailQuestion}>
                                    {question.question}
                                </span>
                                <span className={styles.pickerRailValue}>
                                    {answerText(question, answer)}
                                </span>
                            </span>
                            <span className={styles.pickerRailChange} aria-hidden="true">
                                Change
                            </span>
                        </button>
                    </li>
                );
            })}
        </ol>
    );
};

// A reopened unit question's chips start on the unit already chosen.
const reopenedOffer = (offer: UnitOffer, answer: ElicitationAnswer | undefined): UnitOffer =>
    answer?.kind === 'unit'
        ? {
              ...offer,
              start: {
                  currency: answer.currency,
                  prices: answer.prices,
                  base_year: answer.base_year,
              },
          }
        : offer;

// The open question of a multi-question pause: its options as a radiogroup
// labelled by the question and the counter, the free-text field and its own
// Skip, or for a unit question the unit chips with Send and Skip. The option
// already chosen (on a reopened question) or just clicked is marked.
const OpenQuestion = ({
    question,
    index,
    total,
    answer,
    marked,
    rises,
    draft,
    onDraft,
    onPick,
    onAnswer,
}: {
    question: ClarifyQuestion;
    index: number;
    total: number;
    answer: ElicitationAnswer | undefined;
    marked: string | null;
    rises: boolean;
    draft: string | undefined;
    onDraft: (text: string) => void;
    onPick: (optionId: string) => void;
    onAnswer: (answer: ElicitationAnswer) => void;
}) => {
    const questionId = useId();
    const countId = useId();
    // The radiogroup has one Tab stop: the option last focused, else the
    // chosen one, else the first. Arrow keys move focus (see SeveralQuestions)
    // and `onFocus` moves the stop with it.
    const [focusedId, setFocusedId] = useState<string | null>(null);
    const [ticked, setTicked] = useState<string[]>(
        answer?.kind === 'options' ? answer.option_ids : [],
    );
    const checkedId = marked ?? (answer?.kind === 'option' ? answer.option_id : null);
    const tabStop = tabStopId(
        question.options.map((option) => option.id),
        focusedId,
        checkedId,
    );

    return (
        <div className={classNames(styles.pickerStep, rises && styles.pickerStepIn)}>
            <div className={styles.pickerHead}>
                <p id={questionId} className={styles.pickerQuestion}>
                    {question.question}
                </p>
                <span
                    id={countId}
                    className={styles.pickerCount}
                    aria-label={`Question ${index + 1} of ${total}`}
                >
                    {index + 1}/{total}
                </span>
            </div>
            {question.multi && (
                <MultiOptions
                    question={question}
                    ticked={ticked}
                    labelledBy={`${questionId} ${countId}`}
                    onToggle={(id) => setTicked((current) => toggled(question, current, id))}
                />
            )}
            {!question.multi && question.options.length > 0 && (
                <div
                    className={styles.pickerOptions}
                    role="radiogroup"
                    aria-labelledby={`${questionId} ${countId}`}
                >
                    {question.options.map((option) => {
                        const chosen = checkedId === option.id;

                        return (
                            <button
                                key={option.id}
                                type="button"
                                role="radio"
                                aria-checked={chosen}
                                tabIndex={option.id === tabStop ? 0 : -1}
                                onFocus={() => setFocusedId(option.id)}
                                className={classNames(
                                    styles.pickerOption,
                                    chosen && styles.pickerOptionChosen,
                                )}
                                onClick={() => onPick(option.id)}
                            >
                                <OptionContent option={option} />
                            </button>
                        );
                    })}
                </div>
            )}
            {question.rationale && <p className={styles.pickerRationale}>{question.rationale}</p>}
            {question.unit && (
                <UnitChoice
                    offer={reopenedOffer(question.unit, answer)}
                    onSend={(unit) => onAnswer(unitAnswer(unit))}
                    onSkip={question.skippable ? () => onAnswer({ kind: 'skipped' }) : undefined}
                />
            )}
            {question.showText && (
                <TextAnswer
                    labelledBy={questionId}
                    initial={draft ?? (answer?.kind === 'text' ? answer.text : '')}
                    ticked={question.multi && ticked.length > 0}
                    onDraft={onDraft}
                    onSubmit={(text) =>
                        onAnswer(
                            question.multi
                                ? multiAnswer(question, text, ticked)
                                : { kind: 'text', text },
                        )
                    }
                />
            )}
            {question.skippable && !question.unit && (
                <Button
                    variant="bordered"
                    className={styles.pickerSkip}
                    onClick={() => onAnswer({ kind: 'skipped' })}
                >
                    Skip
                </Button>
            )}
        </div>
    );
};

// Several questions, one at a time. A click marks the option, records it
// and opens the next unanswered question. Answered questions sit on the dot
// rail. After the last, "Check your answers" lists them all with one Send,
// the only control that replies. The stepper's rules live in
// clarifyStepper.ts.
const SeveralQuestions = ({
    pause,
    onAnswer,
}: {
    pause: Clarify;
    onAnswer: (answers: ClarifyAnswers) => void;
}) => {
    const [stepper, setStepper] = useState(startStepper);
    const [marked, setMarked] = useState<string | null>(null);
    // Unsent text per question id. The open step remounts on every move, so
    // its field would lose what was typed. The draft outlives that and goes
    // when the question's answer is recorded.
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    // Bumps on every move. It keys the open step, so the step remounts
    // (replaying its rise and resetting its text field), and it triggers the
    // focus move.
    const [moves, setMoves] = useState(0);
    const cardRef = useRef<HTMLDivElement>(null);
    const sendRef = useRef<HTMLElement>(null);
    const markTimer = useRef(0);

    useEffect(() => () => window.clearTimeout(markTimer.current), []);

    // After a move, focus lands on the open question's marked option (or its
    // first), its first unit chip, its text field when it offers no options,
    // or Send.
    useEffect(() => {
        if (moves === 0) {
            return;
        }

        const card = cardRef.current;
        const target =
            card?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ??
            card?.querySelector<HTMLElement>(
                '[role="radio"], [role="checkbox"], [data-unit-focus], input',
            ) ??
            sendRef.current;

        target?.focus({ preventScroll: true });
    }, [moves]);

    const open = stepper.open === null ? undefined : pause.questions[stepper.open];

    const clearDraft = (id: string) =>
        setDrafts((current) =>
            Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)),
        );

    const move = (next: (current: Stepper) => Stepper) => {
        setStepper(next);
        setMarked(null);
        setMoves((count) => count + 1);
    };

    const record = (answer: ElicitationAnswer) => {
        if (marked === null && open) {
            move((current) => recordAnswer(pause, current, answer));
            clearDraft(open.id);
        }
    };

    const pick = (optionId: string) => {
        if (marked !== null || !open) {
            return;
        }

        const { id } = open;

        setMarked(optionId);
        markTimer.current = window.setTimeout(() => {
            move((current) =>
                recordAnswer(pause, current, { kind: 'option', option_id: optionId }),
            );
            clearDraft(id);
        }, MARK_MS);
    };

    const change = (index: number) => {
        if (marked === null) {
            move((current) => reopen(pause, current, index));
        }
    };

    const send = () => {
        const answers = stepperAnswers(pause, stepper);

        if (answers) {
            onAnswer(answers);
        }
    };

    // Keys 1-9 pick an option of the open question, one per press, and the
    // arrows move focus between its options. Typing in the text field and keys
    // held with Ctrl, Alt or Cmd (browser and OS shortcuts) are left alone.
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        // Focus moves after each answer. A held Enter must stop before it
        // can activate the next question or the check step's Send.
        if (event.key === 'Enter' && event.repeat) {
            event.preventDefault();

            return;
        }

        if (
            event.target instanceof HTMLInputElement ||
            stepper.open === null ||
            event.metaKey ||
            event.ctrlKey ||
            event.altKey
        ) {
            return;
        }

        const openQuestion = pause.questions[stepper.open];
        const options = openQuestion?.options ?? [];
        const digit = openQuestion?.multi
            ? null
            : digitPick(event.key, event.repeat, options.length);

        if (digit !== null) {
            event.preventDefault();
            pick(options[digit].id);

            return;
        }

        const radios = [
            ...(cardRef.current?.querySelectorAll<HTMLElement>(
                '[role="radio"], [role="checkbox"]',
            ) ?? []),
        ];
        const at = radios.indexOf(document.activeElement as HTMLElement);
        const target = at >= 0 ? arrowTarget(event.key, at, radios.length) : null;

        if (target !== null) {
            event.preventDefault();
            radios[target]?.focus();
        }
    };

    const { before, after } = stepperRail(pause, stepper);
    const rail = (indices: number[]) => (
        <Rail pause={pause} stepper={stepper} indices={indices} onChange={change} />
    );

    return (
        <div
            ref={cardRef}
            className={styles.picker}
            role="group"
            aria-label={`${pause.questions.length} questions`}
            onKeyDown={onKeyDown}
        >
            {!open ? (
                <div
                    key={moves}
                    className={classNames(styles.pickerStep, moves > 0 && styles.pickerStepIn)}
                >
                    <div className={styles.pickerHead}>
                        <p className={styles.pickerQuestion}>Check your answers</p>
                    </div>
                    {rail(before)}
                    <Button
                        ref={sendRef}
                        variant="dark"
                        className={styles.pickerSend}
                        onClick={send}
                    >
                        Send
                    </Button>
                </div>
            ) : (
                <>
                    {rail(before)}
                    <OpenQuestion
                        key={moves}
                        question={open}
                        index={pause.questions.indexOf(open)}
                        total={pause.questions.length}
                        answer={stepper.answers[open.id]}
                        marked={marked}
                        rises={moves > 0}
                        draft={drafts[open.id]}
                        onDraft={(text) =>
                            setDrafts((current) => ({ ...current, [open.id]: text }))
                        }
                        onPick={pick}
                        onAnswer={record}
                    />
                    {rail(after)}
                </>
            )}
        </div>
    );
};

// A clarify turn replaces the input with a picker card until it's answered
// or skipped. A pause with one question shows the one-click card, and several
// questions show the stepper.
const ClarifyPicker = ({ clarify, onAnswer, onSkip }: ClarifyPickerProps) => {
    const [first] = clarify.questions;

    if (!first) {
        return null;
    }

    if (clarify.questions.length > 1) {
        return <SeveralQuestions pause={clarify} onAnswer={onAnswer} />;
    }

    return <OneQuestion pause={clarify} question={first} onAnswer={onAnswer} onSkip={onSkip} />;
};

export default ClarifyPicker;
