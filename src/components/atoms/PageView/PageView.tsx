'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { isEmbedPath } from '@/lib/embed';
import { track } from '@/lib/events/client';

// Sends `page.view` with the path on the first load and on each App Router
// navigation, whatever the visitor's consent: the event stores nothing on the
// device, and the server keys it to the day's visitor (src/lib/events/dayVisitor).
// Embeds count as `embed.view` on the server instead. The ref keeps React's
// development double effect from sending a path twice.
const PageView = () => {
    const pathname = usePathname();
    const sent = useRef<string | null>(null);

    useEffect(() => {
        if (sent.current === pathname || isEmbedPath(pathname)) return;

        sent.current = pathname;
        track('page.view', {}, pathname);
    }, [pathname]);

    return null;
};

export default PageView;
