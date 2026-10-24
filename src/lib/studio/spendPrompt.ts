import { createHash } from 'node:crypto';

import { inboxOf } from '../auth/inbox.ts';
import { limiterBucket } from '../proxy/caller.ts';
import {
    refundReservation,
    reserveHit,
    type CounterDb,
    type Reservation,
} from '../proxy/limitCounter.ts';
import { problem } from '../proxy/problem.ts';
import { GUEST_PROMPTS, USER_DAILY_PROMPTS } from './promptAllowance.ts';
import type { ToolError } from './wire.ts';

/**
 * The Studio's prompt allowances, spent by the proxy
 * (src/app/api/v1/studio/[...path]/route.ts) before it forwards a turn. A
 * signed-in user is counted by the inbox their address reaches (inboxOf).
 * An email code makes a separate account for each spelling of an address
 * (`ana.silva@gmail.com`, `anasilva+1@gmail.com`), and those accounts share
 * one allowance. A guest is counted by network
 * address, an IPv6 one by its /64 (limiterBucket), so a cleared or private
 * browser starts no fresh allowance. Guests behind one shared address (an
 * office, a carrier's NAT) share its allowance and are asked to sign in
 * sooner. Both allowances run per UTC day.
 *
 * Only a turn spends one, and a turn the harness never starts gets it back.
 * An interrupt answers a pause the turn itself raised, and the harness
 * bounds how many a turn can raise.
 */

const DAY_S = 86_400;

// How long a turn waits on its allowance before it is refused.
const ADMIT_TIMEOUT_MS = 5_000;

// The harness routes the browser calls (src/lib/studio/studioClient.ts).
const STUDIO_ROUTES = new Set(['turn', 'interrupt', 'cancel', 'composition']);

/**
 * The harness route a proxied path names, or null for any other path. The
 * proxy builds its target from the name returned, so no spelling of a path
 * that the harness would decode to `turn` (`%74urn`, say) can reach the
 * turn route without spending a prompt.
 */
export const studioRoute = (path: readonly string[]): string | null =>
    path.length === 1 && STUDIO_ROUTES.has(path[0]!) ? path[0]! : null;

// A signed-in user by their account's email, or a guest by the client
// address the proxy resolved (src/lib/proxy/forward's clientIp).
export type Prompter = { email: string } | { address: string };

export type PromptSpend =
    { receipt: Reservation; refusal: null } | { receipt: null; refusal: ToolError };

// A signed-in key holds a SHA-256 digest of the inbox, so the table holds no
// email address.
const counterOf = (prompter: Prompter) =>
    'address' in prompter
        ? { key: `studio-guest:${limiterBucket(prompter.address)}`, allowance: GUEST_PROMPTS }
        : {
              key: `studio-user:${createHash('sha256').update(inboxOf(prompter.email)).digest('hex')}`,
              allowance: USER_DAILY_PROMPTS,
          };

/**
 * Spend one of `prompter`'s prompts for today. An admitted spend returns its
 * receipt; a refusal returns the HTTP 429 body. Throws what the database throws.
 */
export const spendPrompt = async (db: CounterDb, prompter: Prompter): Promise<PromptSpend> => {
    const { key, allowance } = counterOf(prompter);
    const reservation = await reserveHit(db, key, allowance, DAY_S);

    if (reservation.admitted) {
        return { receipt: reservation.receipt, refusal: null };
    }

    return {
        receipt: null,
        refusal:
            'address' in prompter
                ? {
                      error: 'resource_exhausted',
                      retry: 'do_not_retry',
                      detail: `This network has used today's ${GUEST_PROMPTS} guest prompts. Sign in to keep exploring Studio. It's free.`,
                      retry_after_seconds: reservation.reset,
                  }
                : {
                      error: 'resource_exhausted',
                      retry: 'retry_after_delay',
                      detail: `You've used today's ${USER_DAILY_PROMPTS} prompts. Your allowance resets at 00:00 UTC.`,
                      retry_after_seconds: reservation.reset,
                  },
    };
};

/** Give back a prompt spent today on a turn the harness never started. */
export const refundPrompt = (db: CounterDb, receipt: Reservation): Promise<void> =>
    refundReservation(db, receipt);

/**
 * The proxy's answer to a turn before it is forwarded, given `spend`, which
 * spends the caller's prompt: null to forward the turn, 429 when `spend`
 * refuses it, 503 when `spend` throws or has not answered within
 * `timeoutMs`. The allowance caps model spend, so a turn whose allowance
 * cannot be read is refused rather than run.
 */
export const admitTurn = async (
    spend: () => Promise<ToolError | null>,
    timeoutMs: number = ADMIT_TIMEOUT_MS,
): Promise<Response | null> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let refusal: ToolError | null;

    try {
        refusal = await Promise.race([
            spend(),
            new Promise<never>((_, reject) => {
                timer = setTimeout(
                    () => reject(new Error(`no answer within ${timeoutMs} ms`)),
                    timeoutMs,
                );
            }),
        ]);
    } catch (error) {
        console.error('studio: the prompt allowance could not be read', error);

        return problem({
            status: 503,
            code: 'transient_unavailable',
            detail: 'Studio cannot check your prompt allowance right now. Try again in a minute.',
            retryable: true,
        });
    } finally {
        clearTimeout(timer);
    }

    return (
        refusal &&
        problem({
            status: 429,
            code: refusal.error,
            detail: refusal.detail,
            retryable: refusal.retry === 'retry_after_delay',
            headers: { 'Retry-After': String(refusal.retry_after_seconds) },
            extra: { retry_after_seconds: refusal.retry_after_seconds },
        })
    );
};

/**
 * Run a turn through `forward` with its prompt spent first. `forward`
 * receives `admit`, which spends the caller's prompt through `spend` and
 * answers as admitTurn does. The prompt comes back, through `refund`, when
 * the response `forward` returns is not ok, since the turn never started.
 * It also comes back when a spend lands after admitTurn gave up on it and
 * refused the turn. A prompt is refunded once. The spend refunds when it
 * finds the turn already answered, and the turn's end refunds when it finds
 * a recorded spend. A refused or failed spend records nothing, so nothing
 * is refunded.
 */
export const meterTurn = async <R>(
    spend: () => Promise<{ receipt: R | null; refusal: ToolError | null }>,
    refund: (receipt: R) => Promise<void>,
    forward: (admit: () => Promise<Response | null>) => Promise<Response>,
    timeoutMs: number = ADMIT_TIMEOUT_MS,
): Promise<Response> => {
    // Whoever spent a prompt on this call, and whether the call has been
    // answered, so exactly one side gives a prompt back.
    let receipt: R | null = null;
    let answered = false;

    const spendAndRecord = async () => {
        const result = await spend();

        if (result.receipt !== null) {
            receipt = result.receipt;

            if (answered) {
                await refund(result.receipt);
            }
        }

        return result.refusal;
    };

    const response = await forward(() => admitTurn(spendAndRecord, timeoutMs));

    answered = true;

    if (receipt !== null && !response.ok) {
        await refund(receipt);
    }

    return response;
};
