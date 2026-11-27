import ConsentRecovery from './ConsentRecovery';
import { CONSENT_SCRIPTS } from './consentScripts';

// The consent scripts and GA4 tag every root layout renders: the website's
// (src/app/layout.tsx) and the prototypes app's (prototypes/app/layout.tsx),
// which shares the site's origin and so its visitors' choices. GA4 renders only
// here, through ConsentRecovery, so it never runs without the Consent Mode
// defaults.
//
// Both scripts are plain inline <script> tags, which the browser runs while it
// parses the server HTML, in source order: the defaults, then the loader.
// ConsentRecovery runs them after the layout commits on the client, which
// covers render paths whose server HTML lacks the layout, and then mounts GA4.
// next/script's beforeInteractive strategy would defer both scripts until
// Next's client chunks load, which delays the banner: on a first visit the
// banner text is the page's largest paint, and Usercentrics reaches it through
// about ten sequential requests that begin with the loader. Inside <body>: a
// <script> straight under <html> is invalid markup and breaks hydration.
const Analytics = () => (
    <>
        {CONSENT_SCRIPTS.map(({ id, code }) => (
            <script key={id} id={id} dangerouslySetInnerHTML={{ __html: code }} />
        ))}
        <ConsentRecovery />
    </>
);

export default Analytics;
