import 'server-only';

import { revalidatePath } from 'next/cache';

import { refuseCrossOrigin } from '@/lib/apiKeys/sameOrigin';
import { adminFrom } from '@/lib/apiKeys/settings';
import { getUser } from '@/lib/auth/session';
import { problem, requestInvalidProblem } from '@/lib/proxy/problem';

import { artifactPath } from './artifact';
import { readEdit, readPublish, topicLabel } from './publish';
import { addTopic, insertArtifact, listTopics, removeArtifact, updateArtifact } from './store';

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

/** The Library's publishers. One list covers publishing, editing, deleting
 *  and adding topics. */
export const libraryAdmin = async () => adminFrom(await getUser(), process.env.ADMIN_EMAILS);

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

/** POST /api/library/artifacts (PublishInput) → { slug } */
export const publish = async (request: Request): Promise<Response> => {
    const { refusal, admin } = await gate(request, true);

    if (refusal) {
        return refusal;
    }

    const read = readPublish(await request.json().catch(() => null));

    if (!read.ok) {
        return requestInvalidProblem(read.detail, read.pointer || undefined, NO_STORE);
    }

    const made = await insertArtifact(read.value, admin.id);

    if (made === 'unknown_topic') {
        return unknownTopic();
    }

    log('publish', admin.email, made.slug);
    refresh(made.slug);

    return Response.json(made, { status: 201, headers: NO_STORE });
};

/** PATCH /api/library/artifacts/<id> (ArtifactText) → { slug } */
export const edit = async (request: Request, id: string): Promise<Response> => {
    const { refusal, admin } = await gate(request, true);

    if (refusal) {
        return refusal;
    }

    const read = readEdit(await request.json().catch(() => null));

    if (!read.ok) {
        return requestInvalidProblem(read.detail, read.pointer || undefined, NO_STORE);
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

/** DELETE /api/library/artifacts/<id> → 204 */
export const remove = async (request: Request, id: string): Promise<Response> => {
    const { refusal, admin } = await gate(request, true);

    if (refusal) {
        return refusal;
    }

    if (!(await removeArtifact(id))) {
        return notFound();
    }

    log('delete', admin.email, id);
    revalidatePath('/library');

    return new Response(null, { status: 204, headers: NO_STORE });
};
