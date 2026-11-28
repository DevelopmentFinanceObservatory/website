import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { after } from 'next/server';

import EmbedView from '@/components/organisms/EmbedView/EmbedView';
import { auth } from '@/lib/auth/auth';
import { getShare, slotDepsFor, viewerOwnsShare } from '@/lib/chat/shareStore';
import { embedDataView } from '@/lib/events/dataView';
import { refererHost } from '@/lib/events/referer';
import { shareViewEvent } from '@/lib/events/shareView';
import { track } from '@/lib/events/track';
import { requestCaller } from '@/lib/proxy/caller';
import { EMBED_FOOT_HOST, EMBED_FOOT_PARAM } from '@/lib/studio/embedHost';
import { sharedViewOfRecord } from '@/lib/studio/slotCards';

type EmbedPageProps = {
    params: Promise<{ id: string }>;
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const generateMetadata = async ({ params }: EmbedPageProps): Promise<Metadata> => {
    const { id } = await params;
    const row = await getShare(id);

    // Embedded, so it rides someone else's page — never its own search hit.
    return {
        title: row?.title ?? 'DFO Studio',
        robots: { index: false, follow: false },
    };
};

// The iframe view of a share: just the read-only sheet, or the one card,
// edge to edge. A search share has no sheet to embed. A live share's data
// cards leave the server held and are filled in the browser
// (src/lib/studio/slotCards). `?foot=host` offers the live strip to the
// site's own page framing the embed, which takes it over with a handshake
// (src/lib/studio/embedHost).
const EmbedPage = async ({ params, searchParams }: EmbedPageProps) => {
    const { id } = await params;
    const row = await getShare(id);

    if (!row || row.kind === 'search') {
        notFound();
    }

    // Counted here, server-side, with nothing stored on the device, so it
    // needs no consent. embed.view holds no address or id. data.view stores
    // the caller digest (a keyed digest of the client address) in the events
    // table, and the export keeps it, so the two rows of one render sit
    // together in the export. embed.view holds who viewed the share
    // (`viewer`: owner, other, signed_out or unknown) and `internal_eng`, read
    // from the domain of the session's verified email, and leaves off the user
    // id (src/lib/events/shareView).
    // Headers are read during render: inside after() they throw.
    const incoming = await headers();
    const host = refererHost(incoming.get('referer'));
    const caller = requestCaller(incoming) ?? null;
    const sharedView = sharedViewOfRecord(slotDepsFor(incoming), row);

    after(async () => {
        // The session is read here, after the response, so the render does not wait on it.
        const { props, who } = await shareViewEvent({
            shareId: id,
            props: { kind: row.kind, host },
            label: 'embed.view',
            readSession: () =>
                auth.api.getSession({ headers: incoming, query: { disableRefresh: true } }),
            ownsShare: viewerOwnsShare,
        });

        await track('embed.view', props, { ...who, headers: incoming });

        // One data.view per embed served, of the frames dfo-apis last recorded
        // for the share, so the count rests on the site's own render and on
        // nothing a browser reports. It uses the same anonymous `who` and
        // carries no share id, which beside the caller digest would tie an
        // owner's address to their account.
        const shown = await sharedView.catch(() => null);
        const dataView =
            shown &&
            embedDataView({
                slots: row.slots,
                shownSlots: Object.values(shown.slots),
                host,
                caller,
            });

        if (dataView) {
            await track('data.view', dataView, { ...who, headers: incoming });
        }
    });

    const footHost = (await searchParams)?.[EMBED_FOOT_PARAM] === EMBED_FOOT_HOST;

    return <EmbedView shared={await sharedView} footHost={footHost} />;
};

export default EmbedPage;
