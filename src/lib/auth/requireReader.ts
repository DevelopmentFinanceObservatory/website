import 'server-only';

import { redirect } from 'next/navigation';

import { getUser } from '@/lib/auth/session';

import {
    decideReader,
    emptyAllowlistWarning,
    parseEmailDomains,
    type ReaderDecision,
} from './reader';

type SessionUser = NonNullable<Awaited<ReturnType<typeof getUser>>>;

/**
 * The allowlisted email domains, read once from `GRAPH_EXPLORER_EMAIL_DOMAINS`
 * when the module first loads. An empty list is logged then, once.
 */
const READER_DOMAINS = parseEmailDomains(process.env.GRAPH_EXPLORER_EMAIL_DOMAINS);
const allowlistWarning = emptyAllowlistWarning(READER_DOMAINS);
if (allowlistWarning !== null) console.warn(allowlistWarning);

/**
 * The gate's decision for the current request, without redirecting. A
 * route handler answers 401 for `signed_out` and 403 for the refusals.
 */
export const readerDecision = async (): Promise<ReaderDecision<SessionUser>> =>
    decideReader(await getUser(), READER_DOMAINS);

/**
 * The gate for a page or layout: a signed-out visitor is redirected to
 * `signIn`. Anyone signed in gets the decision, admitted or refused.
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
