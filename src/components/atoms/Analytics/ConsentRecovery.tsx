'use client';

import { useEffect, useState } from 'react';

import GoogleAnalytics from '@/components/atoms/GoogleAnalytics/GoogleAnalytics';

import { CONSENT_SCRIPTS } from './consentScripts';

// Runs the consent scripts once the root layout has committed on the client,
// then mounts GA4. When the server HTML carries the root layout, the browser
// has already run the inline copies while parsing and these runs do nothing.
// When it does not (the `__next_error__` shell Next serves for notFound() or an
// error thrown from a page, after which React renders the root layout on the
// client), the <script> tags React inserts never run, and these runs set the
// defaults and load Usercentrics. A <script> made with createElement runs when
// it is attached. GA4 mounts after the defaults on both paths.
const ConsentRecovery = () => {
    const [ready, setReady] = useState(false);

    useEffect(() => {
        for (const { code } of CONSENT_SCRIPTS) {
            const script = document.createElement('script');

            script.text = code;
            document.head.appendChild(script);
            script.remove();
        }

        // eslint-disable-next-line react-hooks/set-state-in-effect -- GA4 must mount after the scripts above have run, which only an effect can follow
        setReady(true);
    }, []);

    return ready ? <GoogleAnalytics /> : null;
};

export default ConsentRecovery;
