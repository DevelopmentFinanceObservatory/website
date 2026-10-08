'use client';

import { useEffect, useRef } from 'react';

/**
 * Put the caret in a dialog's own field when it opens (QA-23).
 *
 * The field's `autoFocus` cannot do it: Modal keeps focus out of the dialog
 * by default, which suits a drawer opened beside the content it edits, and
 * that blocking lands after React's autofocus. Letting the dialog take focus
 * instead is no better — it would go to the first tabbable thing, which is a
 * header button, not the field.
 *
 * So the field is named outright, a frame after opening: by then the dialog
 * has finished its own focus work and nothing takes the caret back.
 *
 * Editing an existing note or title puts the caret after the text rather
 * than before it, so typing continues what is there.
 */
export const useOpenFocus = <T extends HTMLInputElement | HTMLTextAreaElement>(open: boolean) => {
    const ref = useRef<T>(null);

    useEffect(() => {
        if (!open) {
            return;
        }

        const frame = requestAnimationFrame(() => {
            const field = ref.current;

            if (!field) {
                return;
            }

            field.focus();

            const end = field.value.length;

            field.setSelectionRange(end, end);
        });

        return () => cancelAnimationFrame(frame);
    }, [open]);

    return ref;
};
