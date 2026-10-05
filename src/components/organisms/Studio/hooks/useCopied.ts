'use client';

import { useEffect, useState } from 'react';

/** Copies text to the clipboard, and reads `copied` as true for a moment
 *  after. */
export const useCopied = () => {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) {
            return;
        }

        const timer = window.setTimeout(() => setCopied(false), 1400);

        return () => window.clearTimeout(timer);
    }, [copied]);

    const copy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
        } catch {
            // Clipboard blocked: the text is selectable, nothing else to do.
        }
    };

    return { copied, copy };
};
