import { useEffect, useRef, useState } from 'react';

import { usePromptShell } from '../../shellContext';

/** How long a control shows how its action ended (the tick, `Copied`, a
 *  failure line), in ms. */
export const CONFIRM_MS = 1600;

export type Outcome = 'done' | 'failed';

/** The words a control shows and announces when its action ends. */
export type OutcomeWords = {
    /** Without them a success shows nothing. */
    done?: string;
    failed: string;
};

/**
 * Runs a panel control's action (a copy, an image) and holds how it ended
 * for CONFIRM_MS, announcing the matching words. A rejection, or a result
 * of `false`, is a failure. The action is called before anything is
 * awaited, so a clipboard write it starts runs inside the click.
 */
export const useConfirm = () => {
    const { announce } = usePromptShell();
    const [outcome, setOutcome] = useState<Outcome | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => () => clearTimeout(timer.current), []);

    const run = async (action: () => unknown, words: OutcomeWords): Promise<void> => {
        let ended: Outcome;

        try {
            ended = (await action()) === false ? 'failed' : 'done';
        } catch (error) {
            console.error(error);
            ended = 'failed';
        }

        const said = ended === 'done' ? words.done : words.failed;

        clearTimeout(timer.current);

        if (!said) {
            setOutcome(null);

            return;
        }

        setOutcome(ended);
        announce(said);
        timer.current = setTimeout(() => setOutcome(null), CONFIRM_MS);
    };

    return { outcome, run };
};
