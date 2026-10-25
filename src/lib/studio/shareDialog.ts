import type { SavedConversation } from '../chat/history.ts';
import type { ShareMode, StudioShareKind } from '../chat/shareMode.ts';
import { pruneForShare } from '../chat/sharePrune.ts';
import type { Widget } from '../chat/widgets.ts';
import { dataCardsOf, type LiveDeps, liveFailureKind, refreshLiveCards } from './liveCards.ts';

/**
 * The Studio share dialog's links (`ShareModal`): one per share kind, card,
 * and mode, each made once per opening.
 *
 * A snapshot link is ready as soon as `POST /api/share` answers. A live
 * link is offered only when every data card it holds can refresh, so
 * `openShareLink` asks the refresh route for each card once the share
 * exists (the route a viewer hits, which leaves the answers stored for the
 * first one) and reports the count as cards settle. When the site refuses
 * to make the share, or a card settles on a failure that asking again
 * cannot fix, the link is withdrawn. The share is deleted and its URL is
 * not reported. A failure that asking again can fix leaves the link
 * standing, since the card asks again when the link opens.
 *
 * The module has no React or path-alias dependency, so `node --test`
 * imports it.
 */

/** A data card a share holds: its widget id and the title its owner sees. */
export type SharedCard = { id: string; title: string };

/** Why the site made no share. `failed` is every fault a second try can
 *  outlive: the network, a 5xx, a session that lapsed. */
export type ShareRefusal =
    | { code: 'live_cards_blocked'; cardIds: string[] }
    | { code: 'live_too_many_cards'; limit: number; count: number }
    | { code: 'live_unavailable' }
    | { code: 'guest_limit' }
    | { code: 'failed' };

/** What `POST /api/share` came to: the share's id, or the refusal. */
export type ShareAnswer = { id: string } | { refusal: ShareRefusal };

/** A made share with the data cards it holds, or the refusal with the cards
 *  the share would have held. */
export type ShareMint = (ShareAnswer & { cards: SharedCard[] }) | { refusal: ShareRefusal };

/** Why a live link is not offered. `cards` names the ones that cannot
 *  refresh. `limit` is the cap on a live share's data cards. `unavailable`
 *  is a site that cannot refresh any card. */
export type Withdrawal =
    | { reason: 'cards'; cards: SharedCard[] }
    | { reason: 'limit'; limit: number; count: number }
    | { reason: 'unavailable' };

/**
 * One link of the dialog. A key with no entry is being made. `checking`: a
 * live share exists and `checked` of its `total` data cards have settled.
 * Its URL is not shown yet. `ready`: the link to copy, in the mode it has
 * now, with the number of cards whose check failed for a passing reason.
 * `withdrawn`: no link, and why. `failed`: the share was not made and a
 * second try may make it. `limited`: a guest has made today's GUEST_SHARES.
 */
export type ShareLink =
    | { status: 'checking'; id: string; checked: number; total: number }
    | { status: 'ready'; id: string; mode: ShareMode; unchecked: number }
    | { status: 'withdrawn'; withdrawal: Withdrawal }
    | { status: 'failed' }
    | { status: 'limited' };

/** The dialog's key for a link, which keeps one mode's link from showing for
 *  the other mode and one card's from showing for another. */
export const shareLinkKey = (
    kind: StudioShareKind,
    cardId: string | undefined,
    mode: ShareMode,
): string => `${kind}:${cardId ?? ''}:${mode}`;

/**
 * Whether the dialog offers the mode choice for a link of `kind`, and the
 * mode that link is made in. `offerLive` is false when the site cannot
 * refresh cards or the share would hold no data card. When it is false, and
 * for a conversation always, there is no choice and the link is a snapshot.
 */
export const shareModeFor = (
    offerLive: boolean,
    kind: StudioShareKind | null,
    chosen: ShareMode,
): { choice: boolean; mode: ShareMode } => {
    const choice = offerLive && (kind === 'canvas' || kind === 'card');

    return { choice, mode: choice ? chosen : 'snapshot' };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const FAILED: ShareAnswer = { refusal: { code: 'failed' } };

/** The answer of `POST /api/share` for a Studio share, from the response's
 *  `ok` and its JSON body. */
export const readShareAnswer = (ok: boolean, body: unknown): ShareAnswer => {
    if (!isRecord(body)) {
        return FAILED;
    }

    if (ok) {
        return typeof body['id'] === 'string' && body['id'] ? { id: body['id'] } : FAILED;
    }

    // Every refusal is a problem document; its `code` says which.
    const { code, cards, limit, count } = body;

    if (code === 'live_cards_blocked' && Array.isArray(cards)) {
        const cardIds = cards.flatMap((card) =>
            isRecord(card) && typeof card['id'] === 'string' ? [card['id']] : [],
        );

        return cardIds.length ? { refusal: { code, cardIds } } : FAILED;
    }

    if (code === 'live_too_many_cards' && typeof limit === 'number' && typeof count === 'number') {
        return { refusal: { code, limit, count } };
    }

    return code === 'live_unavailable' || code === 'guest_limit' ? { refusal: { code } } : FAILED;
};

/**
 * The data cards a share of `kind` holds, with the titles their owner
 * sees: the cards the site checks when a live share is made and the ones a
 * viewer's page refreshes. `titleOf` is the title a card draws when its
 * owner set none.
 */
export const sharedDataCards = (
    saved: SavedConversation,
    kind: StudioShareKind,
    cardId: string | undefined,
    titleOf: (widget: Widget) => string,
): SharedCard[] =>
    dataCardsOf(pruneForShare(saved, kind, cardId)).map((widget) => ({
        id: widget.id,
        title: saved.titles?.[widget.id] ?? titleOf(widget),
    }));

const withdrawalOf = (refusal: ShareRefusal, cards: SharedCard[]): Withdrawal | null => {
    switch (refusal.code) {
        case 'live_cards_blocked':
            return {
                reason: 'cards',
                cards: cards.filter((card) => refusal.cardIds.includes(card.id)),
            };
        case 'live_too_many_cards':
            return { reason: 'limit', limit: refusal.limit, count: refusal.count };
        case 'live_unavailable':
            return { reason: 'unavailable' };
        case 'guest_limit':
        case 'failed':
            return null;
    }
};

const shareUrl = (id: string): string => `/api/share/${encodeURIComponent(id)}`;

/** Deletes the caller's own share (`DELETE /api/share/[id]`). */
export const deleteShare = async (fetcher: typeof fetch, id: string): Promise<boolean> => {
    try {
        return (await fetcher(shareUrl(id), { method: 'DELETE' })).ok;
    } catch {
        return false;
    }
};

/** Turns the caller's own live share into a snapshot
 *  (`PATCH /api/share/[id]`). */
export const snapshotShare = async (fetcher: typeof fetch, id: string): Promise<boolean> => {
    try {
        const response = await fetcher(shareUrl(id), {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'snapshot' }),
        });

        return response.ok;
    } catch {
        return false;
    }
};

export type ShareLinkDeps = {
    createShare: (
        kind: StudioShareKind,
        cardId: string | undefined,
        mode: ShareMode,
    ) => Promise<ShareMint>;
    live: LiveDeps;
};

/**
 * Makes one link and reports each state it passes through, ending on
 * `ready`, `withdrawn`, or `failed`. It runs to its end whatever becomes of
 * the dialog, so a live share that must be withdrawn is deleted even after
 * the dialog closes.
 */
export const openShareLink = async (
    { createShare, live }: ShareLinkDeps,
    request: { kind: StudioShareKind; cardId: string | undefined; mode: ShareMode },
    report: (link: ShareLink) => void,
): Promise<void> => {
    const { kind, cardId, mode } = request;
    const mint = await createShare(kind, cardId, mode);

    if ('refusal' in mint) {
        const withdrawal = withdrawalOf(mint.refusal, 'cards' in mint ? mint.cards : []);

        report(
            withdrawal
                ? { status: 'withdrawn', withdrawal }
                : { status: mint.refusal.code === 'guest_limit' ? 'limited' : 'failed' },
        );

        return;
    }

    const { id, cards } = mint;

    if (mode === 'snapshot' || cards.length === 0) {
        report({ status: 'ready', id, mode, unchecked: 0 });

        return;
    }

    const total = cards.length;
    const blocked: SharedCard[] = [];
    let checked = 0;
    let unchecked = 0;
    let switchedOff = false;

    report({ status: 'checking', id, checked, total });

    await refreshLiveCards(live, {
        shareId: id,
        cardIds: cards.map((card) => card.id),
        // The signal is never aborted, so the checks finish and a withdrawal
        // can follow them.
        signal: new AbortController().signal,
        onSettled: (settledId, outcome) => {
            const failure = outcome.status === 'error' ? liveFailureKind(outcome) : null;

            if (failure === 'permanent') {
                blocked.push(...cards.filter((card) => card.id === settledId));
            } else if (failure === 'switched_off') {
                switchedOff = true;
            } else if (failure === 'transient') {
                unchecked += 1;
            }

            checked += 1;
            report({ status: 'checking', id, checked, total });
        },
    });

    if (!switchedOff && blocked.length === 0) {
        report({ status: 'ready', id, mode, unchecked });

        return;
    }

    await deleteShare(live.fetch, id);
    report({
        status: 'withdrawn',
        withdrawal: switchedOff
            ? { reason: 'unavailable' }
            : // In the canvas's own order, whatever order the answers came in.
              { reason: 'cards', cards: cards.filter((card) => blocked.includes(card)) },
    });
};

const NAMES = new Intl.ListFormat('en-GB', { style: 'long', type: 'conjunction' });

const quoted = (cards: SharedCard[]): string =>
    NAMES.format(cards.map((card) => `"${card.title}"`));

/** The sentence that says why there is no live link. `single` is a share
 *  of one card, where the card needs no naming. */
export const withdrawalText = (withdrawal: Withdrawal, single: boolean): string => {
    switch (withdrawal.reason) {
        case 'limit':
            return `A live link holds up to ${withdrawal.limit} data cards and this canvas has ${withdrawal.count}.`;
        case 'unavailable':
            return 'Live data is unavailable right now.';
        case 'cards': {
            const { cards } = withdrawal;

            if (single) {
                return 'This card cannot show live data, so it has no live link.';
            }

            if (cards.length === 0) {
                return 'A card on this canvas cannot show live data, so the canvas has no live link.';
            }

            return `${quoted(cards)} cannot show live data, so this canvas has no live link.`;
        }
    }
};

/** The line shown while a live share's cards are checked. */
export const checkingText = (checked: number, total: number): string =>
    total === 1
        ? 'Checking that the card can show live data.'
        : `Checking that every card can show live data: ${checked} of ${total} done.`;

/** The line under a ready live link when the check of `count` cards failed
 *  for a passing reason, or null when every card answered. */
export const uncheckedText = (count: number): string | null => {
    if (count === 0) {
        return null;
    }

    return count === 1
        ? '1 card could not be checked just now. It tries again when the link opens.'
        : `${count} cards could not be checked just now. They try again when the link opens.`;
};
