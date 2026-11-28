import { createHash } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { limitCounter } from '../../../db/schema.ts';
import { inboxOf } from '../auth/inbox.ts';
import { limiterBucket } from '../proxy/caller.ts';
import {
    refundReservation,
    reserveHit,
    type CounterDb,
    type Reservation,
} from '../proxy/limitCounter.ts';
import { problem } from '../proxy/problem.ts';
import { GUEST_PROMPTS, HOLD_REFUND_WINDOW_MS, USER_DAILY_PROMPTS } from './promptAllowance.ts';
import type { ToolError } from './wire.ts';

// The hold turn's headers, which the proxy reads and sets, and its refund window.
export {
    HOLD_REFUND_WINDOW_MS,
    HOLD_TURN_HEADER,
    PROMPT_REFUNDED_HEADER,
} from './promptAllowance.ts';

/**
 * The Studio's prompt allowances, spent by the proxy
 * (src/lib/studio/studioProxy.ts) before it forwards a turn. A
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
 *
 * A hold turn, one Get Data starts while its move to Studio holds
 * (HOLD_TURN_HEADER), also gets its prompt back when the prompter cancels it
 * within HOLD_REFUND_WINDOW_MS of the harness admitting it, at most
 * HOLD_REFUNDS_PER_DAY times a UTC day (recordHoldTurn, claimHoldTurn,
 * refundHoldTurn).
 */

const DAY_S = 86_400;

// How long a turn waits on its allowance before it is refused.
const ADMIT_TIMEOUT_MS = 5_000;

// The harness routes the browser calls (src/lib/studio/studioClient.ts).
// Only `turn` spends a prompt. `state` reads a conversation and `resume`
// continues a turn already paid for.
const STUDIO_ROUTES = new Set(['turn', 'interrupt', 'cancel', 'composition', 'state', 'resume']);

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

/** The limit_counter key that counts `prompter`'s prompts. */
export const promptCounterKey = (prompter: Prompter): string => counterOf(prompter).key;

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
export const refundPrompt = async (db: CounterDb, receipt: Reservation): Promise<void> => {
    await refundReservation(db, receipt);
};

/** How many hold turns a prompter's cancels refund in a UTC day. */
export const HOLD_REFUNDS_PER_DAY = 3;

/** A turn as the harness names it: its conversation and the turn's index. */
export type HarnessTurn = { conversationId: string; turnIndex: number };

/**
 * The turn index of a harness header or body member: a non-negative integer,
 * or a string of digits. Null for anything else.
 */
export const turnIndexOf = (value: unknown): number | null => {
    const index = typeof value === 'string' && /^\d{1,15}$/.test(value) ? Number(value) : value;

    return typeof index === 'number' && Number.isSafeInteger(index) && index >= 0 ? index : null;
};

// A hold turn's receipt is a limit_counter row whose window_start is the
// spent prompt's window and whose expires_at is the refund deadline. Its key
// starts with the prompter's counter key, so a cancel finds only its own
// caller's receipts, and pruneCounters deletes it once the deadline passes.
const holdReceiptKey = (counterKey: string, { conversationId, turnIndex }: HarnessTurn) =>
    `studio-refundable:${counterKey}:${conversationId}:${turnIndex}`;

const holdRefundKey = (counterKey: string) => `studio-refund:${counterKey}`;

/**
 * Record that `receipt` paid for the hold turn `turn`, refundable for
 * `windowMs` from now on the database's clock. Throws what the database throws.
 */
export const recordHoldTurn = async (
    db: CounterDb,
    receipt: Reservation,
    turn: HarnessTurn,
    windowMs: number = HOLD_REFUND_WINDOW_MS,
): Promise<void> => {
    await db.execute(sql`
        insert into ${limitCounter} (key, window_start, count, expires_at)
        values (
            ${holdReceiptKey(receipt.key, turn)},
            ${receipt.windowStart},
            1,
            now() + make_interval(secs => ${windowMs / 1000})
        )
        on conflict (key) do update set
            window_start = excluded.window_start,
            count = 1,
            expires_at = excluded.expires_at
    `);
};

/**
 * Take `prompter`'s receipt for the hold turn `turn` if its deadline had not
 * passed `sinceMs` ago, when the cancel arrived. Returns the prompt the
 * receipt paid for, or null when there is none. A receipt is taken once.
 * Throws what the database throws.
 */
export const claimHoldTurn = async (
    db: CounterDb,
    prompter: Prompter,
    turn: HarnessTurn,
    sinceMs: number = 0,
): Promise<Reservation | null> => {
    const key = promptCounterKey(prompter);
    const { rows } = await db.execute<{ window_start: Date }>(sql`
        delete from ${limitCounter}
        where ${limitCounter.key} = ${holdReceiptKey(key, turn)}
            and ${limitCounter.expiresAt} > now() - make_interval(secs => ${sinceMs / 1000})
        returning window_start
    `);
    const windowStart = rows[0]?.window_start;

    return windowStart ? { key, windowStart } : null;
};

/**
 * Give back the prompt a claimed hold turn paid for, within the prompter's
 * HOLD_REFUNDS_PER_DAY. False when the day's refunds are spent, or when the
 * prompt was spent on an earlier day than today. Throws what the database throws.
 */
export const refundHoldTurn = async (db: CounterDb, paid: Reservation): Promise<boolean> => {
    const cap = await reserveHit(db, holdRefundKey(paid.key), HOLD_REFUNDS_PER_DAY, DAY_S);

    if (!cap.admitted) {
        return false;
    }

    if (await refundReservation(db, paid)) {
        return true;
    }

    await refundReservation(db, cap.receipt);

    return false;
};

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
 * answers as admitTurn does. When the response `forward` returns is ok,
 * `started` gets the receipt and the response before meterTurn returns it.
 * The prompt comes back, through `refund`, when
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
    {
        started,
        timeoutMs = ADMIT_TIMEOUT_MS,
    }: {
        started?: (receipt: R, response: Response) => Promise<void>;
        timeoutMs?: number;
    } = {},
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

    if (receipt !== null) {
        await (response.ok ? started?.(receipt, response) : refund(receipt));
    }

    return response;
};
