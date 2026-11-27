/**
 * What a publisher sends to put a Studio output in the Library, or to change
 * one that is there, and the rules it is held to. Pure, so the Studio's
 * dialog, the artifact page's dialog and the routes share them (the routes
 * are in ./admin.ts).
 *
 * The body arrives from the network, so each field is narrowed before use and
 * the first one that fails is named by its JSON pointer.
 */

import type { ArtifactKind, LibrarySource, LibraryStep } from './artifact.ts';
import type { SavedConversation } from '../chat/history.ts';
import type { ShareMode } from '../chat/shareMode.ts';
import type { PanelView } from '../studio/descriptionBlocks.ts';

export const LIMITS = {
    title: 140,
    description: 600,
    contentTitle: 140,
    content: 8000,
    topic: 40,
    topics: 12,
    sources: 30,
    steps: 30,
    line: 300,
    slug: 80,
} as const;

/** The fields a publisher writes, in the publish and the edit dialogs. */
export type ArtifactText = {
    title: string;
    description: string;
    contentTitle: string | null;
    content: string | null;
    /** Topic labels, each one of the Library's topics. */
    topics: string[];
};

/** What the Library shows, the canvas or one card of it. */
export type PublishedShare = {
    kind: 'canvas' | 'card';
    conversation: SavedConversation;
    /** The card's id, for a card. */
    cardId?: string;
    mode: ShareMode;
};

/**
 * The body of `POST /api/library/artifacts`. `publishKey` is a random UUID
 * the publisher makes once per artifact and mode and sends again on every
 * try, so a publish whose answer was lost makes no second artifact. The
 * server makes the share from `share`, and reads the artifact's kind, mode,
 * sources and steps from the cards that share shows.
 */
export type PublishInput = ArtifactText & {
    publishKey: string;
    /** The artifact's address in `slugOf` form. Without it the server makes
     *  one from the title. */
    slug?: string;
    share: PublishedShare;
};

/** A publish as the route reads it. `share` is checked for its kind alone,
 *  and the share route's reader (`readStudioShareRequest`) reads the rest. */
export type PublishRequest = {
    text: ArtifactText;
    publishKey: string;
    /** The slug the publisher chose, or null to make one from the title. */
    slug: string | null;
    share: Record<string, unknown> & { kind: 'canvas' | 'card' };
};

export type Read<T> = { ok: true; value: T } | { ok: false; pointer: string; detail: string };

const PUBLISH_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The bar the Library's list params join their values with (./artifact.ts),
// which a topic's label and a source's name therefore leave out.
const SEPARATOR = '|';

const squeeze = (text: string): string => text.trim().replace(/[ \t]+/g, ' ');

const refuse = (pointer: string, detail: string) => ({ ok: false as const, pointer, detail });

/** A topic's label as it is stored: trimmed, single-spaced. Null when it is
 *  empty or too long. */
export const topicLabel = (raw: unknown): string | null => {
    if (typeof raw !== 'string') {
        return null;
    }

    const label = squeeze(raw.replace(/\s+/g, ' '));

    return label.length > 0 && label.length <= LIMITS.topic && !label.includes(SEPARATOR)
        ? label
        : null;
};

// A required line of text within `max`.
const line = (raw: unknown, max: number): string | null => {
    if (typeof raw !== 'string') {
        return null;
    }

    const text = squeeze(raw.replace(/\s+/g, ' '));

    return text.length > 0 && text.length <= max ? text : null;
};

// Required text within `max` whose line breaks are kept.
const paragraphs = (raw: unknown, max: number): string | null => {
    if (typeof raw !== 'string') {
        return null;
    }

    const text = raw.trim();

    return text.length > 0 && text.length <= max ? text : null;
};

// Optional text, where null or blank reads as none. `false` marks text that
// is not a string or runs past `max`.
const optional = (raw: unknown, max: number, lines: boolean): string | null | false => {
    if (raw === null || raw === undefined) {
        return null;
    }

    if (typeof raw !== 'string') {
        return false;
    }

    const text = lines ? raw.trim() : squeeze(raw.replace(/\s+/g, ' '));

    if (text.length > max) {
        return false;
    }

    return text || null;
};

// A source's page, which is an outside https page or the source's page on
// this site.
const sourceUrl = (raw: unknown): string | null | false => {
    if (raw === null || raw === undefined) {
        return null;
    }

    if (typeof raw !== 'string' || raw.length > 500) {
        return false;
    }

    if (raw.startsWith('/data/sources/') && !raw.includes('//')) {
        return raw;
    }

    return URL.canParse(raw) && new URL(raw).protocol === 'https:' ? raw : false;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The fields a publisher writes, narrowed, or the first one at fault by its
 * JSON pointer with the sentence to show. The edit route reads its body
 * with it, the publish route the text of its body, and the dialogs check
 * their fields with it before they send them.
 */
export const readArtifactText = (body: unknown): Read<ArtifactText> => {
    if (!isRecord(body)) {
        return refuse('', 'Send a JSON object.');
    }

    const title = line(body.title, LIMITS.title);

    if (!title) {
        return refuse('/title', `Give it a title of 1 to ${LIMITS.title} characters.`);
    }

    const description = paragraphs(body.description, LIMITS.description);

    if (!description) {
        return refuse(
            '/description',
            `Give it a description of 1 to ${LIMITS.description} characters.`,
        );
    }

    const contentTitle = optional(body.contentTitle, LIMITS.contentTitle, false);

    if (contentTitle === false) {
        return refuse(
            '/contentTitle',
            `Keep the content title to ${LIMITS.contentTitle} characters.`,
        );
    }

    const content = optional(body.content, LIMITS.content, true);

    if (content === false) {
        return refuse('/content', `Keep the content to ${LIMITS.content} characters.`);
    }

    const raw = body.topics ?? [];

    if (!Array.isArray(raw) || raw.length > LIMITS.topics) {
        return refuse('/topics', `Pick up to ${LIMITS.topics} topics.`);
    }

    const topics = raw.map(topicLabel);

    if (topics.some((topic) => topic === null)) {
        return refuse('/topics', 'A topic is not one of the Library’s.');
    }

    return {
        ok: true,
        value: {
            title,
            description,
            contentTitle: content ? contentTitle : null,
            content,
            topics: [...new Set(topics as string[])],
        },
    };
};

/**
 * A chosen slug: null when there is none (the body's `slug` absent or
 * null), which leaves the server to make one from the title, or a slug
 * already in `slugOf` form. The publish route
 * reads the body's `slug` with it, and the Publish tab checks its URL field
 * with it before sending.
 */
export const readSlug = (raw: unknown): Read<string | null> => {
    if (raw === undefined || raw === null) {
        return { ok: true, value: null };
    }

    return typeof raw === 'string' && raw !== '' && slugOf(raw) === raw
        ? { ok: true, value: raw }
        : refuse(
              '/slug',
              `Give it a URL of 1 to ${LIMITS.slug} lower-case letters, digits and single hyphens.`,
          );
};

/**
 * The `replacedBy` of a withdrawal or of a later change to it: the id of the
 * artifact the withdrawn one's address links to, or null for none. A
 * missing body, a missing member and null all read as none.
 */
export const readReplacement = (body: unknown): Read<string | null> => {
    if (body === null || body === undefined) {
        return { ok: true, value: null };
    }

    if (!isRecord(body)) {
        return refuse('', 'Send a JSON object.');
    }

    const raw = body.replacedBy ?? null;

    if (raw === null) {
        return { ok: true, value: null };
    }

    return typeof raw === 'string' && raw.length > 0 && raw.length <= 64
        ? { ok: true, value: raw }
        : refuse('/replacedBy', 'Name the replacement by its id.');
};

/**
 * The publish key's slot in the Publish tab: one key per artifact picked,
 * mode and chosen slug (`readSlug`'s value, null while the slug follows the
 * title). A retry with all three unchanged sends the key again, so a publish
 * whose answer was lost makes no second artifact. A changed slug gets a new
 * key, so the retry is not answered with an artifact under the old one.
 */
export const publishKeySlot = (picked: string, mode: string, slug: string | null): string =>
    JSON.stringify([picked, mode, slug]);

/** The body of a publish, or the first field at fault. A conversation
 *  share is not an artifact, so `share.kind` is `canvas` or `card`. */
export const readPublish = (body: unknown): Read<PublishRequest> => {
    const text = readArtifactText(body);

    if (!text.ok || !isRecord(body)) {
        return text.ok ? refuse('', 'Send a JSON object.') : text;
    }

    if (typeof body.publishKey !== 'string' || !PUBLISH_KEY.test(body.publishKey)) {
        return refuse('/publishKey', 'The publish has no key.');
    }

    const slug = readSlug(body.slug);

    if (!slug.ok) {
        return slug;
    }

    const share = body.share;

    if (!isRecord(share) || (share.kind !== 'canvas' && share.kind !== 'card')) {
        return refuse('/share/kind', 'Publish a canvas or one card of it.');
    }

    return {
        ok: true,
        value: {
            text: text.value,
            publishKey: body.publishKey,
            slug: slug.value,
            share: { ...share, kind: share.kind },
        },
    };
};

/**
 * The artifact's kind: `canvas` for a canvas, and for one card the card's
 * own kind. `shown` is the cards the share shows. Null for a card that is
 * not a chart, a table or a key number, which leaves a text card out.
 */
export const publishedKind = (
    shareKind: 'canvas' | 'card',
    shown: readonly { kind: string }[],
): Exclude<ArtifactKind, 'data'> | null => {
    if (shareKind === 'canvas') {
        return 'canvas';
    }

    const [card] = shown;
    const kind = shown.length === 1 ? card.kind : null;

    return kind === 'chart' || kind === 'table' || kind === 'key_number' ? kind : null;
};

// Lower-case ASCII words joined by single hyphens, with no length limit.
const slugWords = (text: string): string =>
    text
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');

/**
 * The title as the artifact's address: lower-case ASCII words joined by
 * hyphens, at most 80 characters. A title with no letter or digit in it
 * reads `artifact`. A slug is its own `slugOf`.
 */
export const slugOf = (title: string): string =>
    slugWords(title)
        .slice(0, LIMITS.slug)
        .replace(/^-+|-+$/g, '') || 'artifact';

/** `base`, or `base-2`, `base-3`… the first that `taken` does not hold. */
export const freeSlug = (base: string, taken: ReadonlySet<string>): string => {
    if (!taken.has(base)) {
        return base;
    }

    let count = 2;

    while (taken.has(`${base}-${count}`)) {
        count += 1;
    }

    return `${base}-${count}`;
};

const clip = (text: string, max: number): string =>
    squeeze(text.replace(/\s+/g, ' ')).slice(0, max);

/**
 * What the Library copies from the cards an artifact of `kind` shows, which
 * is every source they credit, each once by name, and, for an artifact of
 * one card, the steps it was made by. A canvas has no steps of its own.
 * Each value is cut to the Library's limits, and a source page that is
 * neither https nor a source page of this site is left out.
 */
export const publishedFacts = (
    kind: ArtifactKind,
    views: readonly PanelView[],
): { sources: LibrarySource[]; steps: LibraryStep[] } => {
    const sources = new Map<string, LibrarySource>();

    for (const view of views) {
        for (const source of view.sources) {
            const name = clip(source.name.replaceAll(SEPARATOR, '/'), LIMITS.line);

            if (name && !sources.has(name)) {
                const url = sourceUrl(
                    source.url ?? (source.page ? `/data/sources/${source.page}` : null),
                );

                sources.set(name, { name, url: url || null });
            }
        }
    }

    const [only] = views;
    const made =
        kind !== 'canvas' && views.length === 1 && only.kind === 'described' ? only.made : null;

    return {
        sources: [...sources.values()].slice(0, LIMITS.sources),
        steps: (made?.steps ?? [])
            .map((step) => ({
                title: clip(step.verb ? `${step.verb} ${step.object}` : step.object, LIMITS.line),
                detail: step.detail ? clip(step.detail, LIMITS.line * 4) || null : null,
            }))
            .filter((step) => step.title)
            .slice(0, LIMITS.steps),
    };
};
