/**
 * What a publisher sends to put a Studio output in the Library, or to change
 * one that is there, and the rules it is held to. Pure, so the Studio's
 * dialog, the artifact page's dialog and the routes share them (the routes
 * are in ./admin.ts).
 *
 * The body arrives from the network, so each field is narrowed before use and
 * the first one that fails is named by its JSON pointer.
 */

import type { ArtifactKind, ArtifactMode, LibrarySource, LibraryStep } from './artifact.ts';
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

export type PublishInput = ArtifactText & {
    shareId: string;
    kind: Exclude<ArtifactKind, 'data'>;
    mode: ArtifactMode;
    sources: LibrarySource[];
    steps: LibraryStep[];
};

export type Read<T> = { ok: true; value: T } | { ok: false; pointer: string; detail: string };

// A share's id as dfo-apis issues it (src/lib/chat/apisShares.ts).
const SHARE_ID = /^[A-Za-z0-9]{8}$/;

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

const readText = (body: Record<string, unknown>): Read<ArtifactText> => {
    const title = line(body.title, LIMITS.title);

    if (!title) {
        return refuse('/title', `Give it a title of 1 to ${LIMITS.title} characters.`);
    }

    const description = line(body.description, LIMITS.description);

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

/** The body of an edit as the fields it changes. */
export const readEdit = (body: unknown): Read<ArtifactText> =>
    isRecord(body) ? readText(body) : refuse('', 'Send a JSON object.');

/** The body of a publish as the artifact it makes. */
export const readPublish = (body: unknown): Read<PublishInput> => {
    if (!isRecord(body)) {
        return refuse('', 'Send a JSON object.');
    }

    const text = readText(body);

    if (!text.ok) {
        return text;
    }

    if (typeof body.shareId !== 'string' || !SHARE_ID.test(body.shareId)) {
        return refuse('/shareId', 'That is not a share.');
    }

    if (body.kind !== 'chart' && body.kind !== 'canvas') {
        return refuse('/kind', 'Publish a chart or a canvas.');
    }

    if (body.mode !== 'live' && body.mode !== 'snapshot') {
        return refuse('/mode', 'Publish live data or a snapshot.');
    }

    const rawSources = body.sources ?? [];
    const rawSteps = body.steps ?? [];

    if (!Array.isArray(rawSources) || rawSources.length > LIMITS.sources) {
        return refuse('/sources', 'The sources are not a list.');
    }

    if (!Array.isArray(rawSteps) || rawSteps.length > LIMITS.steps) {
        return refuse('/steps', 'The steps are not a list.');
    }

    const sources: LibrarySource[] = [];

    for (const raw of rawSources) {
        const name = isRecord(raw) ? line(raw.name, LIMITS.line) : null;
        const url = isRecord(raw) ? sourceUrl(raw.url) : false;

        if (!name || name.includes(SEPARATOR) || url === false) {
            return refuse('/sources', 'A source has no name or a page that is not a link.');
        }

        sources.push({ name, url });
    }

    const steps: LibraryStep[] = [];

    for (const raw of rawSteps) {
        const title = isRecord(raw) ? line(raw.title, LIMITS.line) : null;
        const detail = isRecord(raw) ? optional(raw.detail, LIMITS.line * 4, false) : false;

        if (!title || detail === false) {
            return refuse('/steps', 'A step has no title.');
        }

        steps.push({ title, detail });
    }

    return {
        ok: true,
        value: {
            ...text.value,
            shareId: body.shareId,
            kind: body.kind,
            mode: body.mode,
            sources,
            steps,
        },
    };
};

/**
 * The title as the artifact's address: lower-case ASCII words joined by
 * hyphens, at most 80 characters. A title with no letter or digit in it
 * reads `artifact`.
 */
export const slugOf = (title: string): string =>
    title
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 80)
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
 * What the Library copies from the cards it publishes, which is every source
 * they credit, each once by name, and, for one card alone, the steps it was
 * made by. A canvas has no steps of its own. Each value is cut to what
 * `readPublish` takes, and a source page it would refuse is left out, so a
 * card's own facts never stop a publish.
 */
export const publishedFacts = (
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
    const made = views.length === 1 && only.kind === 'described' ? only.made : null;

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
