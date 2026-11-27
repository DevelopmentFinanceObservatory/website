'use client';

import { useEffect, useState } from 'react';

import Button from '@/components/atoms/Button/Button';

/** Copies the artifact's citable URL, and says so for a moment. */
const ShareButton = ({ url }: { url: string }) => {
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!copied) {
            return;
        }

        const timer = window.setTimeout(() => setCopied(false), 1600);

        return () => window.clearTimeout(timer);
    }, [copied]);

    return (
        <Button
            variant="dark"
            full
            icon="arrow-up-right"
            onClick={async () => {
                try {
                    await navigator.clipboard.writeText(url);
                    setCopied(true);
                } catch {
                    // Clipboard blocked: the URL is in the address bar.
                }
            }}
        >
            {copied ? 'Link copied' : 'Share'}
        </Button>
    );
};

export default ShareButton;
