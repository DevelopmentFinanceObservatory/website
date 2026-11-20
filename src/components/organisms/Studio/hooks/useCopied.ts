'use client';

import { useEffect, useState } from 'react';

/** Copies text to the clipboard, and reads `copied` as true for a moment
 *  after. `copy` resolves to whether the clipboard took the text. */
export const useCopied = () => {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) {
            return;
        }

        const timer = window.setTimeout(() => setCopied(false), 1400);

        return () => window.clearTimeout(timer);
    }, [copied]);

    const copy = async (text: string): Promise<boolean> => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);

            return true;
        } catch {
            // Clipboard blocked: the text is selectable, nothing else to do.
            return false;
        }
    };

    return { copied, copy };
};
