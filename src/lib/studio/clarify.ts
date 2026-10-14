import type {
    ElicitationAnswer,
    ElicitationOption,
    ElicitationQuestion,
    ElicitationRequest,
    InterruptResponse,
    LegacyElicitationRequest,
    StepProgress,
} from './wire';

/**
 * One elicitation option, normalized for rendering. `recommended` is always
 * present (false when the wire omitted it).
 */
export type ClarifyOption = {
    id: string;
    label: string;
    description: string | null;
    recommended: boolean;
};

/**
 * One question of a pending elicitation. `showText` is derived from the
 * question's `input` (`text` renders the free-text field), `allowFreeText`
 * and whether the question can be passed by a skip (its own or the whole
 * pause's), so the card always has a way past the question, even when it
 * offers no options.
 */
export type ClarifyQuestion = {
    id: string;
    question: string;
    options: ClarifyOption[];
    allowFreeText: boolean;
    skippable: boolean;
    showText: boolean;
    rationale: string | null;
};

/**
 * A pending elicitation, normalized from either wire frame into the shape
 * the card renders from. `skippable` is the whole-pause dismiss. `legacy`
 * marks a single-question frame from a harness that predates `questions`,
 * which is answered with `payload` rather than `answers`.
 */
export type Clarify = {
    interruptId: string;
    questions: ClarifyQuestion[];
    skippable: boolean;
    progress: StepProgress | null;
    legacy: boolean;
};

/** The collected answers, keyed by question id. */
export type ClarifyAnswers = Record<string, ElicitationAnswer>;

/** The part of an `interrupt.response` body that answers a clarify. */
export type ClarifyReply = Pick<InterruptResponse, 'decision' | 'payload' | 'answers'>;

// The id the harness gives the only question of a legacy frame when it
// converts that frame's `payload` reply.
const LEGACY_QUESTION_ID = 'q1';

const clarifyOption = (option: ElicitationOption): ClarifyOption => ({
    id: option.id,
    label: option.label,
    description: option.description ?? null,
    recommended: option.recommended ?? false,
});

const clarifyQuestion = (
    question: ElicitationQuestion,
    pauseSkippable: boolean,
): ClarifyQuestion => {
    const options = (question.options ?? []).map(clarifyOption);
    const allowFreeText = question.allow_free_text ?? false;
    const skippable = question.skippable ?? false;
    const passable = skippable || pauseSkippable;

    return {
        id: question.id,
        question: question.question,
        options,
        allowFreeText,
        skippable,
        showText: allowFreeText || question.input === 'text' || (options.length === 0 && !passable),
        rationale: question.rationale ?? null,
    };
};

export const clarifyFromFrame = (frame: ElicitationRequest | LegacyElicitationRequest): Clarify => {
    if ('questions' in frame) {
        const skippable = frame.skippable ?? false;

        return {
            interruptId: frame.interrupt_id,
            questions: frame.questions.map((question) => clarifyQuestion(question, skippable)),
            skippable,
            progress: frame.progress ?? null,
            legacy: false,
        };
    }

    const question: ElicitationQuestion = {
        id: LEGACY_QUESTION_ID,
        question: frame.question,
        input: frame.input,
        options: frame.options,
        allow_free_text: frame.allow_free_text,
        rationale: frame.rationale,
    };

    return {
        interruptId: frame.interrupt_id,
        questions: [clarifyQuestion(question, frame.skippable)],
        skippable: frame.skippable,
        progress: frame.progress ?? null,
        legacy: true,
    };
};

const checkedAnswer = (
    question: ClarifyQuestion,
    answer: ElicitationAnswer | undefined,
    clarify: Clarify,
): ElicitationAnswer => {
    switch (answer?.kind) {
        case undefined:
            throw new Error(`no answer for question ${question.id}`);
        case 'option':
            if (!question.options.some((option) => option.id === answer.option_id)) {
                throw new Error(`question ${question.id} offers no option ${answer.option_id}`);
            }

            return answer;
        case 'text': {
            const text = answer.text.trim();

            if (!text) {
                throw new Error(`empty text answer for question ${question.id}`);
            }

            return { kind: 'text', text };
        }
        case 'skipped':
            // A legacy frame has no per-question skip: its one question is
            // skipped by dismissing the whole pause.
            if (!question.skippable && !(clarify.legacy && clarify.skippable)) {
                throw new Error(`question ${question.id} cannot be skipped`);
            }

            return answer;
    }
};

/**
 * The reply that answers every question of `clarify` at once: `answers`
 * for a current frame. For a legacy frame, the one answer as `payload`, or
 * a whole-pause `skip` when that answer is a skip. Throws on a missing or
 * unknown question id, empty text, an option the question does not offer,
 * or a skip the question does not allow, since the harness refuses each.
 */
export const clarifyReply = (clarify: Clarify, answers: ClarifyAnswers): ClarifyReply => {
    const expected = new Set(clarify.questions.map((question) => question.id));
    const unknown = Object.keys(answers).filter((id) => !expected.has(id));

    if (unknown.length > 0) {
        throw new Error(`answers name unknown questions: ${unknown.join(', ')}`);
    }

    const checked: ClarifyAnswers = Object.fromEntries(
        clarify.questions.map((question) => [
            question.id,
            checkedAnswer(question, answers[question.id], clarify),
        ]),
    );

    if (!clarify.legacy) {
        return { decision: 'answer', answers: checked };
    }

    const answer = checked[LEGACY_QUESTION_ID];

    switch (answer?.kind) {
        case 'option':
            return { decision: 'answer', payload: answer.option_id };
        case 'text':
            return { decision: 'answer', payload: answer.text };
        default:
            return { decision: 'skip' };
    }
};

/**
 * The status-line note for a sent reply: the chosen option labels or typed
 * text of the answered questions in question order, or `Left to DFO` when
 * every question was skipped. A one-question pause answered in the user's
 * own words shows those words alone.
 */
export const clarifyNote = (clarify: Clarify, answers: ClarifyAnswers): string => {
    const [only] = clarify.questions;
    const onlyAnswer = only && clarify.questions.length === 1 ? answers[only.id] : undefined;

    if (onlyAnswer?.kind === 'text') {
        return onlyAnswer.text.trim();
    }

    const chosen = clarify.questions.flatMap((question) => {
        const answer = answers[question.id];

        switch (answer?.kind) {
            case 'option':
                return [
                    question.options.find((option) => option.id === answer.option_id)?.label ??
                        answer.option_id,
                ];
            case 'text':
                return [answer.text.trim()];
            default:
                return [];
        }
    });

    return chosen.length > 0 ? `You chose: ${chosen.join(', ')}` : 'Left to DFO';
};
