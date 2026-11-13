import 'server-only';

import { redirect } from 'next/navigation';

import { getUser } from '@/lib/auth/session';

import { decideReader, parseEmailDomains, type ReaderDecision } from './reader';

type SessionUser = NonNullable<Awaited<ReturnType<typeof getUser>>>;

/** The allowlisted email domains, read once from `GRAPH_EXPLORER_EMAIL_DOMAINS`. */
const READER_DOMAINS = parseEmailDomains(process.env.GRAPH_EXPLORER_EMAIL_DOMAINS);

/**
 * The gate's decision for the current request, without redirecting. A
 * route handler answers 401 for `signed_out` and 403 for the refusals.
 */
export const readerDecision = async (): Promise<ReaderDecision<SessionUser>> =>
    decideReader(await getUser(), READER_DOMAINS);

/**
 * The gate for a page or layout: a signed-out visitor is redirected to
 * `signIn`; anyone signed in gets the decision, admitted or refused.
 */
export const requireReader = async ({
    signIn,
}: {
    signIn: string;
}): Promise<Exclude<ReaderDecision<SessionUser>, { kind: 'signed_out' }>> => {
    const decision = await readerDecision();

    if (decision.kind === 'signed_out') {
        redirect(signIn);
    }

    return decision;
};
