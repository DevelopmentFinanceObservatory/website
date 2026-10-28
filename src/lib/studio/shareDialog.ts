import type { SavedConversation } from '../chat/history.ts';
import type { ShareMode, StudioShareKind } from '../chat/shareMode.ts';
import { pruneForShare } from '../chat/sharePrune.ts';
import type { Widget } from '../chat/widgets.ts';
import { dataCardsOf } from './liveCards.ts';

/**
 * The Studio share dialog's links (`ShareModal`): one per share kind, card,
 * and mode, each made once per opening.
 *
 * A link is ready as soon as `POST /api/share` answers. The site checks a
 * live share's data cards before it makes the share. When they cannot show
 * live data, no share is made, and the refusal withdraws the link and names
 * the cards.
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
    | { code: 'share_limit' }
    | { code: 'failed' };

/** What `POST /api/share` came to: the share's id, or the refusal. */
export type ShareAnswer = { id: string } | { refusal: ShareRefusal };

/** A made share with the data cards it holds, or the refusal with the cards
 *  the share would have held. */
export type ShareMint = (ShareAnswer & { cards: SharedCard[] }) | { refusal: ShareRefusal };

/** Why a live link is not offered. `cards` names the ones that cannot
 *  show live data. `limit` is the cap on a live share's data cards.
 *  `unavailable` is a site that cannot refresh any card. */
export type Withdrawal =
    | { reason: 'cards'; cards: SharedCard[] }
    | { reason: 'limit'; limit: number; count: number }
    | { reason: 'unavailable' };

/**
 * One link of the dialog. A key with no entry is being made. `ready`: the
 * link to copy, in the mode it has now. `withdrawn`: no link, and why.
 * `failed`: the share was not made and a second try may make it. `limited`:
 * this network has made today's shares (dfo-apis' share allowance).
 */
export type ShareLink =
    | { status: 'ready'; id: string; mode: ShareMode }
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
 * mode that link is made in. `offerLive` is false when the share would
 * hold no data card. When it is false, and for a conversation always, there
 * is no choice and the link is a snapshot.
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

    return code === 'live_unavailable' || code === 'share_limit' ? { refusal: { code } } : FAILED;
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
        case 'share_limit':
        case 'failed':
            return null;
    }
};

const shareUrl = (id: string): string => `/api/share/${encodeURIComponent(id)}`;

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
};

/** Makes one link and reports where it ends: `ready`, `withdrawn`,
 *  `limited`, or `failed`. */
export const openShareLink = async (
    { createShare }: ShareLinkDeps,
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
                : { status: mint.refusal.code === 'share_limit' ? 'limited' : 'failed' },
        );

        return;
    }

    report({ status: 'ready', id: mint.id, mode });
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
