import type { Clarify, ClarifyAnswers, ClarifyQuestion } from './clarify';
import type { ElicitationAnswer } from './wire';

/**
 * Where a multi-question clarify card stands. `open` is the index of the
 * question on show, or null on the "Check your answers" step. `checking`
 * turns true the first time every question has an answer. From then on a
 * new answer returns to the check step.
 */
export type Stepper = {
    answers: ClarifyAnswers;
    open: number | null;
    checking: boolean;
};

/** The answered questions shown on the dot rail above and below the open one. */
export type StepperRail = {
    before: number[];
    after: number[];
};

export const startStepper = (): Stepper => ({ answers: {}, open: 0, checking: false });

// The first unanswered question after `from`, wrapping round, or null when
// every question has an answer.
const nextUnanswered = (clarify: Clarify, answers: ClarifyAnswers, from: number): number | null => {
    const count = clarify.questions.length;

    for (let step = 1; step <= count; step += 1) {
        const index = (from + step) % count;
        const question = clarify.questions[index];

        if (question && !answers[question.id]) {
            return index;
        }
    }

    return null;
};

/**
 * Records `answer` for the open question and moves on: to the next
 * unanswered question, or to the check step once all are answered or when
 * the question was reopened from it. Blank text and a skip the question
 * does not allow leave the stepper unchanged.
 */
export const recordAnswer = (
    clarify: Clarify,
    stepper: Stepper,
    answer: ElicitationAnswer,
): Stepper => {
    const question = stepper.open === null ? undefined : clarify.questions[stepper.open];

    if (stepper.open === null || !question) {
        return stepper;
    }

    if (answer.kind === 'text' && !answer.text.trim()) {
        return stepper;
    }

    if (answer.kind === 'skipped' && !question.skippable) {
        return stepper;
    }

    const recorded =
        answer.kind === 'text' ? { kind: 'text' as const, text: answer.text.trim() } : answer;
    const answers = { ...stepper.answers, [question.id]: recorded };
    const open = stepper.checking ? null : nextUnanswered(clarify, answers, stepper.open);

    return { answers, open, checking: stepper.checking || open === null };
};

/** Reopens an answered question, from the rail or the check step. */
export const reopen = (clarify: Clarify, stepper: Stepper, index: number): Stepper => {
    const question = clarify.questions[index];

    if (!question || !stepper.answers[question.id]) {
        return stepper;
    }

    return { ...stepper, open: index };
};

/**
 * The answered questions on the rail: on the check step every question,
 * above the Send; otherwise those before the open question sit above it and
 * those after it below.
 */
export const stepperRail = (clarify: Clarify, stepper: Stepper): StepperRail => {
    const answered = clarify.questions.flatMap((question, index) =>
        stepper.answers[question.id] ? [index] : [],
    );
    const { open } = stepper;

    if (open === null) {
        return { before: answered, after: [] };
    }

    return {
        before: answered.filter((index) => index < open),
        after: answered.filter((index) => index > open),
    };
};

/** Every question's answer for Send, or null while any question has none. */
export const stepperAnswers = (clarify: Clarify, stepper: Stepper): ClarifyAnswers | null =>
    clarify.questions.every((question) => stepper.answers[question.id]) ? stepper.answers : null;

/** An answer as the rail shows it: the option label, the typed text, or "Skipped". */
export const answerText = (question: ClarifyQuestion, answer: ElicitationAnswer): string => {
    switch (answer.kind) {
        case 'option':
            return (
                question.options.find((option) => option.id === answer.option_id)?.label ??
                answer.option_id
            );
        case 'text':
            return answer.text;
        case 'skipped':
            return 'Skipped';
    }
};

/** The accessible name of a rail row: what it reopens and the answer it holds. */
export const railLabel = (question: ClarifyQuestion, answer: ElicitationAnswer): string =>
    `Change your answer to ${question.question}, now ${answerText(question, answer)}`;

/**
 * The option that holds the radiogroup's one Tab stop: the one last focused,
 * else the one checked, else the first. Ids that are not in `optionIds`
 * are ignored.
 */
export const tabStopId = (
    optionIds: string[],
    focusedId: string | null,
    checkedId: string | null,
): string | undefined =>
    [focusedId, checkedId].find((id) => id !== null && optionIds.includes(id)) ?? optionIds[0];

const ARROW_STEP: Record<string, number> = {
    ArrowDown: 1,
    ArrowRight: 1,
    ArrowUp: -1,
    ArrowLeft: -1,
};

/**
 * The index an arrow key moves a radiogroup's focus to from index `from`,
 * wrapping at both ends, or null for any other key.
 */
export const arrowTarget = (key: string, from: number, count: number): number | null => {
    const step = ARROW_STEP[key];

    return step === undefined || count === 0 ? null : (from + step + count) % count;
};

/**
 * The index of the option a digit key picks among `count` options, 1 for the
 * first, or null. A held key repeats its keydown; a repeat picks nothing, so
 * one press answers one question.
 */
export const digitPick = (key: string, repeat: boolean, count: number): number | null => {
    const index = /^[1-9]$/.test(key) ? Number(key) - 1 : -1;

    return repeat || index < 0 || index >= count ? null : index;
};
