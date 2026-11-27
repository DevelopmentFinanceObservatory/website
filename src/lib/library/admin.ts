import 'server-only';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';

import { refuseCrossOrigin } from '@/lib/apiKeys/sameOrigin';
import { adminFrom } from '@/lib/apiKeys/settings';
import { getUser } from '@/lib/auth/session';
import { SharesError } from '@/lib/chat/apisShares';
import { savedCanvasWidgetsOf } from '@/lib/chat/canvas';
import { readStudioShareRequest, shareCreateProps } from '@/lib/chat/shareMode';
import { pruneForShare } from '@/lib/chat/sharePrune';
import { sharesRefusal } from '@/lib/chat/shareRefusal';
import { keepShareForCleanup, makeTokenShare, takeDownTokenShare } from '@/lib/chat/shareStore';
import { buildStudioShare, readShareJson } from '@/lib/chat/studioShare';
import { anonymousWho } from '@/lib/events/internalEng';
import { track } from '@/lib/events/track';
import { problem, requestInvalidProblem, unreachableProblem } from '@/lib/proxy/problem';
import { panelViewOf } from '@/lib/studio/infoPanel';

import { artifactPath } from './artifact';
import { libraryEnabled } from './enabled';
import { evergreenRefusal } from './evergreen';
import { changedText } from './evergreenRule';
import { type LibraryView, libraryViewOf } from './switch';
import {
    publishedFacts,
    publishedKind,
    readArtifactText,
    readPublish,
    topicLabel,
} from './publish';
import {
    addTopic,
    artifactShare,
    artifactText,
    isArtifactWithdrawn,
    insertArtifact,
    listTopics,
    publishTarget,
    updateArtifact,
    withdrawArtifact,
} from './store';
import { type ShareSettling, settleShare, withdraw } from './withdraw';

/*
 * The handlers behind /api/library, which the Studio's share dialog and the
 * artifact page's edit dialog call with fetch. A route handler is a request
 * anyone can send, so each call runs the gate itself. A mutating one must
 * come from a page of this site (lib/apiKeys/sameOrigin), and every one must
 * be an admin's (lib/apiKeys/settings.isAdmin, a verified email on
 * ADMIN_EMAILS). Everyone else, signed out included, gets the same 404, so
 * the routes do not say who may publish. Each mutation logs one line naming
 * the actor and the artifact.
 */

const NO_STORE = { 'Cache-Control': 'no-store' };

const notFound = (): Response =>
    problem({
        status: 404,
        code: 'not_found',
        detail: 'Not found.',
        retryable: false,
        headers: NO_STORE,
    });

const unknownTopic = (): Response =>
    requestInvalidProblem('A topic is not one of the Library’s.', '/topics', NO_STORE);

const slugTaken = (): Response =>
    problem({
        status: 409,
        code: 'slug_taken',
        detail: 'Another artifact uses this URL. Choose a different one.',
        retryable: false,
        headers: NO_STORE,
        extra: { pointer: '/slug' },
    });

// A refusal from the steps the publish shares with `POST /api/share`, sent
// with NO_STORE as every answer here is. `at` names the member of the
// publish body the refused request sits in, which its pointer then starts
// with. A refusal with no pointer points at `at` itself.
const publishRefusal = async (refusal: Response, at?: string): Promise<Response> => {
    const body: unknown = await refusal.json();
    const headers = new Headers(refusal.headers);

    headers.set('Cache-Control', NO_STORE['Cache-Control']);

    const document =
        at && typeof body === 'object' && body !== null
            ? {
                  ...body,
                  pointer:
                      'pointer' in body && typeof body.pointer === 'string'
                          ? at + body.pointer
                          : at,
              }
            : body;

    return new Response(JSON.stringify(document), { status: refusal.status, headers });
};

/** The Library's publishers. One list covers publishing, editing, deleting
 *  and adding topics. */
export const libraryAdmin = async () => adminFrom(await getUser(), process.env.ADMIN_EMAILS);

/**
 * Who sees the Library's pages: everyone while LIBRARY_ENABLED is on
 * (`open`), its admins alone while it is off (`preview`, which search
 * engines are told not to index), and nobody else (`null`, answered with the
 * site's 404).
 */
export const libraryView = async (): Promise<LibraryView> => {
    const enabled = libraryEnabled();

    // An open Library needs no admin lookup.
    return libraryViewOf(enabled, !enabled && (await libraryAdmin()) !== null);
};

// The admin behind a request, or the refusal to send.
const gate = async (request: Request, mutating: boolean) => {
    const crossOrigin = mutating ? refuseCrossOrigin(request) : null;

    if (crossOrigin) {
        return { refusal: crossOrigin };
    }

    const admin = await libraryAdmin();

    return admin ? { admin } : { refusal: notFound() };
};

const log = (action: string, actor: string, artifact: string) =>
    console.log(JSON.stringify({ severity: 'INFO', message: 'library', action, actor, artifact }));

const refresh = (slug: string) => {
    revalidatePath('/library');
    revalidatePath(artifactPath(slug));
};

/** GET /api/library/topics → { topics } */
export const topics = async (request: Request): Promise<Response> => {
    const { refusal } = await gate(request, false);

    return refusal ?? Response.json({ topics: await listTopics() }, { headers: NO_STORE });
};

/** POST /api/library/topics { label } → { topics }, the list with the new one. */
export const createTopic = async (request: Request): Promise<Response> => {
    const { refusal, admin } = await gate(request, true);

    if (refusal) {
        return refusal;
    }

    const body: unknown = await request.json().catch(() => null);
    const label = topicLabel(
        typeof body === 'object' && body !== null && 'label' in body ? body.label : null,
    );

    if (!label) {
        return requestInvalidProblem(
            'Give the topic a name of 1 to 40 characters.',
            '/label',
            NO_STORE,
        );
    }

    if (!(await addTopic(label))) {
        return problem({
            status: 400,
            code: 'topic_taken',
            detail: 'The Library has a topic with that name.',
            retryable: false,
            extra: { pointer: '/label' },
            headers: NO_STORE,
        });
    }

    log('topic.add', admin.email, label);

    return Response.json({ topics: await listTopics() }, { headers: NO_STORE });
};

const artifactWithdrawn = (): Response =>
    problem({
        status: 409,
        code: 'artifact_withdrawn',
        detail: 'This was published and then withdrawn.',
        retryable: false,
        headers: NO_STORE,
    });

// Takes down a share no artifact on show holds, in dfo-apis, or else
// records it in `share_cleanup` for an operator, with the alerted
// `share_cleanup_recorded` line (./withdraw.ts, `settleShare`).
const settling = (headers: Headers): ShareSettling => ({
    takeDown: (share) => takeDownTokenShare(headers, share),
    keepForCleanup: keepShareForCleanup,
});

// Takes down the share of a publish that stored no row. The row-less share
// has no token anywhere else, so a share neither taken down nor recorded is
// known only by its `share_cleanup_not_recorded` line, and the publish's
// own answer stands.
const dropShare = async (
    headers: Headers,
    share: { shareId: string; writeToken: string },
    adminId: string,
): Promise<void> => {
    await settleShare(settling(headers), share, adminId);
};

const WITHDRAWAL_RETRY = {
    unsettled:
        'Its chart could not be taken down or queued for removal, so it is still published. Try again.',
    unwritten: 'Its chart is taken down, but the withdrawal was not saved. Try again.',
};

/**
 * POST /api/library/artifacts (PublishInput, src/lib/library/publish.ts)
 * → 201 { slug, title } for a new artifact, 200 { slug, title } for the one
 * an earlier try with the same `publishKey` made, with the title it stored,
 * and 409 `artifact_withdrawn` when that artifact has since been withdrawn.
 * A body with a `slug` publishes under that slug, and answers 409
 * `slug_taken` at `/slug` when any artifact holds it, withdrawn ones
 * included. Without one, the slug is made from the title, with a number
 * after it when that is taken.
 *
 * Before the share is made, the text is held to the evergreen rule
 * (./evergreen.ts). A 400 `not_evergreen` names each sentence that states
 * what the data shows now, a 503 `evergreen_check_unavailable` says the
 * check could not run, and a 502 `evergreen_check_refused` says TypeSafe
 * refused the request.
 *
 * The share is made here, exactly as `POST /api/share` makes one
 * (src/lib/chat/studioShare.ts) and with its refusals, under a write token
 * the Library keeps in the artifact's row. The artifact's kind, mode,
 * sources and steps come from the cards that share shows. A text card is
 * refused, since the Library has no kind for it. When the row is not
 * stored, because a try with the same key stored first, a topic has gone,
 * another publish took the chosen slug or the insert failed, the new share
 * is taken down.
 */
export const publish = async (request: Request): Promise<Response> => {
    const { refusal, admin } = await gate(request, true);

    if (refusal) {
        return refusal;
    }

    const body = await readShareJson(request.body);

    if (body instanceof Response) {
        return publishRefusal(body);
    }

    const read = readPublish(body);

    if (!read.ok) {
        return requestInvalidProblem(read.detail, read.pointer || undefined, NO_STORE);
    }

    const { text, publishKey, slug } = read.value;
    // One read answers both, so an earlier try that commits meanwhile is
    // seen as that try, and its slug never reads as another artifact's.
    const { earlier, slugHeld } = await publishTarget(publishKey, slug);

    if (earlier?.withdrawn) {
        return artifactWithdrawn();
    }

    if (earlier) {
        return Response.json({ slug: earlier.slug, title: earlier.title }, { headers: NO_STORE });
    }

    if (slugHeld) {
        return slugTaken();
    }

    const known = new Set(await listTopics());

    if (!text.topics.every((topic) => known.has(topic))) {
        return unknownTopic();
    }

    const shareRequest = readStudioShareRequest(read.value.share);

    if (shareRequest instanceof Response) {
        return publishRefusal(shareRequest, '/share');
    }

    const shown = savedCanvasWidgetsOf(
        pruneForShare(shareRequest.saved, shareRequest.kind, shareRequest.cardId),
    );
    const kind = publishedKind(read.value.share.kind, shown);

    if (!kind) {
        return requestInvalidProblem(
            'Publish a chart, a table or a key number. A text card cannot be published.',
            '/share/cardId',
            NO_STORE,
        );
    }

    const notEvergreen = await evergreenRefusal(text, { publishKey });

    if (notEvergreen) {
        return notEvergreen;
    }

    const share = await buildStudioShare(request.headers, shareRequest);

    if (share instanceof Response) {
        return publishRefusal(share);
    }

    let created: { id: string; writeToken: string };

    try {
        created = await makeTokenShare(request.headers, share);
    } catch (error) {
        if (error instanceof SharesError) {
            return publishRefusal(sharesRefusal(error));
        }

        throw error;
    }

    const mode = share.latest ? 'live' : 'snapshot';
    const today = new Date().toISOString().slice(0, 10);
    const views = shown.flatMap((card) =>
        card.info ? [panelViewOf(card.info, { retrievedOn: today })] : [],
    );
    const backing = { shareId: created.id, writeToken: created.writeToken };
    let made: Awaited<ReturnType<typeof insertArtifact>>;

    try {
        made = await insertArtifact(
            {
                ...text,
                publishKey,
                ...(slug ? { slug } : {}),
                shareId: created.id,
                shareWriteToken: created.writeToken,
                kind,
                mode,
                ...publishedFacts(kind, views),
            },
            admin.id,
        );
    } catch (error) {
        await dropShare(request.headers, backing, admin.id);

        throw error;
    }

    if (made === 'unknown_topic' || made === 'slug_taken' || !made.created) {
        await dropShare(request.headers, backing, admin.id);

        if (made === 'unknown_topic') {
            return unknownTopic();
        }

        if (made !== 'slug_taken' && made.withdrawn) {
            return artifactWithdrawn();
        }

        return made === 'slug_taken'
            ? slugTaken()
            : Response.json({ slug: made.slug, title: made.title }, { headers: NO_STORE });
    }

    // Recorded after the response, as `POST /api/share` records its own, so
    // the views of the artifact's share join to its creation. The share
    // belongs to the Library, so the event names no account
    // (docs/analytics.md, `share.create`).
    after(() =>
        track('share.create', shareCreateProps({ id: created.id, kind: share.kind, mode }), {
            ...anonymousWho({ ...admin, emailVerified: true }),
            headers: request.headers,
        }),
    );

    log('publish', admin.email, made.slug);
    refresh(made.slug);

    return Response.json(
        { slug: made.slug, title: made.title },
        { status: 201, headers: NO_STORE },
    );
};

/**
 * PATCH /api/library/artifacts/<id> (ArtifactText) → { slug }. The text
 * fields the edit changes are held to the evergreen rule first, with the
 * publish's 400, 502 and 503 answers.
 */
export const edit = async (request: Request, id: string): Promise<Response> => {
    const { refusal, admin } = await gate(request, true);

    if (refusal) {
        return refusal;
    }

    const read = readArtifactText(await request.json().catch(() => null));

    if (!read.ok) {
        return requestInvalidProblem(read.detail, read.pointer || undefined, NO_STORE);
    }

    const stored = await artifactText(id);

    if (!stored) {
        return notFound();
    }

    const notEvergreen = await evergreenRefusal(changedText(stored, read.value), {
        artifact: id,
    });

    if (notEvergreen) {
        return notEvergreen;
    }

    const changed = await updateArtifact(id, read.value);

    if (changed === 'not_found') {
        return notFound();
    }

    if (changed === 'unknown_topic') {
        return unknownTopic();
    }

    log('edit', admin.email, changed.slug);
    refresh(changed.slug);

    return Response.json(changed, { headers: NO_STORE });
};

/**
 * DELETE /api/library/artifacts/<id> → 204, or 502 `transient_unavailable`
 *
 * Takes the artifact's share down in dfo-apis, or, when dfo-apis cannot,
 * records it in `share_cleanup` for an operator. Once one of those holds, it
 * withdraws the artifact, erases its title and text and forgets the share's
 * token, and answers 204, as does a DELETE that meets the row withdrawn by
 * another one meanwhile. Its address stays and shows that it was withdrawn,
 * and a later DELETE answers 404. When neither holds, nothing changes: the
 * artifact stays published and the answer is a retryable 502, so the Edit
 * dialog's Delete tries again. When the share is settled and the row write
 * fails, the answer is the same retryable 502, and the retry withdraws the
 * row (./withdraw.ts).
 */
export const remove = async (request: Request, id: string): Promise<Response> => {
    const { refusal, admin } = await gate(request, true);

    if (refusal) {
        return refusal;
    }

    const withdrawn = await withdraw(
        {
            ...settling(request.headers),
            share: artifactShare,
            withdraw: withdrawArtifact,
            isWithdrawn: isArtifactWithdrawn,
        },
        id,
        admin.id,
    );

    if (withdrawn === 'not_found') {
        return notFound();
    }

    if (withdrawn.outcome !== 'withdrawn') {
        log(`delete.${withdrawn.outcome}`, admin.email, withdrawn.slug);

        return unreachableProblem(WITHDRAWAL_RETRY[withdrawn.outcome], NO_STORE);
    }

    log('delete', admin.email, withdrawn.slug);
    refresh(withdrawn.slug);

    return new Response(null, { status: 204, headers: NO_STORE });
};
