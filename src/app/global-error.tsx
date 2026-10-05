'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

/**
 * The last-resort error page (a crash in the root layout itself): reports
 * the error to Sentry and offers a reload. Renders its own <html>, as Next
 * requires here — the layout it would use is what just failed.
 */
const GlobalError = ({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) => {
    useEffect(() => {
        Sentry.captureException(error);
    }, [error]);

    return (
        <html lang="en">
            <body style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem' }}>
                <h1>Something went wrong.</h1>
                <p>The page hit an error we didn&apos;t expect. It has been reported.</p>
                <button type="button" onClick={reset}>
                    Try again
                </button>
            </body>
        </html>
    );
};

export default GlobalError;
