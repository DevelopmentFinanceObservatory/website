import type { ElicitationRequest, StepProgress } from './wire';

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
 * A pending elicitation, normalized from the wire frame into the shape the
 * picker renders from. `showText` is derived here from the frame's `input`
 * (`text` renders the free-text field), `allowFreeText` and `skippable`, so
 * the picker always has a way to proceed, even for a frame that offers no
 * options and no skip.
 */
export type Clarify = {
    interruptId: string;
    question: string;
    options: ClarifyOption[];
    allowFreeText: boolean;
    skippable: boolean;
    showText: boolean;
    progress: StepProgress | null;
    rationale: string | null;
};

export const clarifyFromFrame = (frame: ElicitationRequest): Clarify => {
    const options = (frame.options ?? []).map((option) => ({
        id: option.id,
        label: option.label,
        description: option.description ?? null,
        recommended: option.recommended ?? false,
    }));
    const allowFreeText = frame.allow_free_text;
    const skippable = frame.skippable;
    const showText =
        allowFreeText || frame.input === 'text' || (options.length === 0 && !skippable);

    return {
        interruptId: frame.interrupt_id,
        question: frame.question,
        options,
        allowFreeText,
        skippable,
        showText,
        progress: frame.progress ?? null,
        rationale: frame.rationale ?? null,
    };
};
