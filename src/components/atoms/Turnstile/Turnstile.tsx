'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef } from 'react';

type TurnstileApi = {
    render: (element: HTMLElement, options: Record<string, unknown>) => string;
    remove: (widgetId: string) => void;
};

declare global {
    interface Window {
        turnstile?: TurnstileApi;
    }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

type TurnstileProps = {
    siteKey: string;
    /** A fresh token, or null once it expires or the check fails. */
    onToken: (token: string | null) => void;
    /** The script did not load (offline, blocked) or the check failed, so no token will come until it recovers. */
    onUnavailable: () => void;
};

/**
 * Cloudflare Turnstile, the bot check in front of every email sign-in
 * code. It stays invisible unless Cloudflare wants an interaction. A token
 * is good for one request, so remount the widget (change its `key`) to get
 * the next one.
 */
const Turnstile = ({ siteKey, onToken, onUnavailable }: TurnstileProps) => {
    const container = useRef<HTMLDivElement>(null);
    const widget = useRef<string | null>(null);
    const handlers = useRef({ onToken, onUnavailable });

    useEffect(() => {
        handlers.current = { onToken, onUnavailable };
    });

    const render = useCallback(() => {
        if (!container.current || !window.turnstile || widget.current) {
            return;
        }

        widget.current = window.turnstile.render(container.current, {
            sitekey: siteKey,
            appearance: 'interaction-only',
            callback: (token: string) => handlers.current.onToken(token),
            'expired-callback': () => handlers.current.onToken(null),
            'error-callback': () => {
                handlers.current.onToken(null);
                handlers.current.onUnavailable();
            },
        });
    }, [siteKey]);

    // A remount after the script has loaded renders here. The first mount
    // renders from the script's onReady.
    useEffect(() => {
        render();

        return () => {
            if (widget.current) {
                window.turnstile?.remove(widget.current);
                widget.current = null;
            }
        };
    }, [render]);

    return (
        <>
            <Script
                id="cf-turnstile"
                src={SCRIPT_SRC}
                onReady={render}
                onError={() => handlers.current.onUnavailable()}
            />
            <div ref={container} />
        </>
    );
};

export default Turnstile;
