import 'server-only';

import { and, asc, desc, eq, inArray, isNotNull, isNull, like, or, sql } from 'drizzle-orm';
import { cache } from 'react';

import { libraryArtifact, libraryArtifactTopic, libraryTopic } from '../../../db/schema.ts';

import type {
    ArtifactKind,
    ArtifactMode,
    LibraryArtifact,
    LibrarySource,
    LibraryStep,
    Replacement,
    ReplacementChoice,
    WithdrawnArtifact,
} from './artifact.ts';
import { type ArtifactText, freeSlug, slugOf } from './publish.ts';
import type { LibraryCardDates } from '../../../db/schema.ts';

import { db } from '@/lib/db';
import { uuid } from '@/lib/uuid';

/**
 * The Library's artifacts, read from the website's own tables (db/schema.ts,
 * `library_artifact`), newest first, each with its topics by name, and the
 * writes behind publishing, editing and withdrawing one. The writes trust
 * their caller: ./admin.ts checks who asks and narrows what they send.
 *
 * Every read names its columns, so the share's write token reaches only
 * `artifactShare` and stays out of pages and the props they hand the
 * browser.
 */

const topicsOf = async (ids: string[]): Promise<Map<string, string[]>> => {
    const byArtifact = new Map<string, string[]>();

    if (ids.length === 0) {
        return byArtifact;
    }

    const rows = await db
        .select({ artifactId: libraryArtifactTopic.artifactId, label: libraryTopic.label })
        .from(libraryArtifactTopic)
        .innerJoin(libraryTopic, eq(libraryTopic.id, libraryArtifactTopic.topicId))
        .where(inArray(libraryArtifactTopic.artifactId, ids))
        .orderBy(asc(libraryTopic.label));

    for (const row of rows) {
        byArtifact.set(row.artifactId, [...(byArtifact.get(row.artifactId) ?? []), row.label]);
    }

    return byArtifact;
};

const ARTIFACT_COLUMNS = {
    id: libraryArtifact.id,
    slug: libraryArtifact.slug,
    shareId: libraryArtifact.shareId,
    kind: libraryArtifact.kind,
    mode: libraryArtifact.mode,
    title: libraryArtifact.title,
    description: libraryArtifact.description,
    contentTitle: libraryArtifact.contentTitle,
    content: libraryArtifact.content,
    sources: libraryArtifact.sources,
    steps: libraryArtifact.steps,
    cardDates: libraryArtifact.cardDates,
    publishedAt: libraryArtifact.publishedAt,
    updatedAt: libraryArtifact.updatedAt,
    withdrawnAt: libraryArtifact.withdrawnAt,
    replacedBy: libraryArtifact.replacedBy,
};

const selectArtifacts = () => db.select(ARTIFACT_COLUMNS).from(libraryArtifact);

type ArtifactRow = Awaited<ReturnType<typeof selectArtifacts>>[number];

// The check constraints on `kind` and `mode` hold the values to these.
const toArtifact = (row: ArtifactRow, topics: string[]): LibraryArtifact => ({
    id: row.id,
    slug: row.slug,
    shareId: row.shareId,
    kind: row.kind as ArtifactKind,
    mode: row.mode as ArtifactMode,
    title: row.title,
    description: row.description,
    contentTitle: row.contentTitle,
    content: row.content,
    sources: row.sources,
    steps: row.steps,
    topics,
    cardDates: row.cardDates,
    publishedAt: row.publishedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
});

const live = isNull(libraryArtifact.withdrawnAt);

/** Every artifact on show, newest first. Withdrawn ones are left out. */
export const listArtifacts = async (): Promise<LibraryArtifact[]> => {
    const rows = await selectArtifacts().where(live).orderBy(desc(libraryArtifact.publishedAt));
    const topics = await topicsOf(rows.map((row) => row.id));

    return rows.map((row) => toArtifact(row, topics.get(row.id) ?? []));
};

/** The slugs of the artifacts on show, for the sitemap. */
export const librarySlugs = async (): Promise<string[]> =>
    (await db.select({ slug: libraryArtifact.slug }).from(libraryArtifact).where(live)).map(
        (row) => row.slug,
    );

/** What the address `/library/<slug>` shows. */
export type ArtifactAtSlug =
    | { status: 'published'; artifact: LibraryArtifact }
    | { status: 'withdrawn'; artifact: WithdrawnArtifact };

/** The artifact published under `slug`, withdrawn or not, or null when no
 *  artifact ever had it. One read per request, however many readers (the
 *  page and its metadata). */
export const artifactBySlug = cache(async (slug: string): Promise<ArtifactAtSlug | null> => {
    const [row] = await selectArtifacts().where(eq(libraryArtifact.slug, slug));

    if (!row) {
        return null;
    }

    if (row.withdrawnAt) {
        return {
            status: 'withdrawn',
            artifact: {
                id: row.id,
                slug: row.slug,
                kind: row.kind as ArtifactKind,
                publishedAt: row.publishedAt.toISOString(),
                withdrawnAt: row.withdrawnAt.toISOString(),
                replacedBy: row.replacedBy,
                replacement: await replacementOf(row.id),
            },
        };
    }

    return {
        status: 'published',
        artifact: toArtifact(row, (await topicsOf([row.id])).get(row.id) ?? []),
    };
});

/** How many replacements a withdrawn artifact's address follows to reach a
 *  published one. A longer chain, or a loop of withdrawn artifacts, links
 *  nowhere. */
export const REPLACEMENT_HOPS = 5;

/**
 * The artifact withdrawn artifact `id`'s address links to: down the chain of
 * `replaced_by`, the first one still published, within `REPLACEMENT_HOPS`
 * steps. Null when none is named or none in reach is published. Read on each
 * request, so a replacement withdrawn later hands on to its own.
 */
export const replacementOf = async (id: string): Promise<Replacement | null> => {
    const { rows } = await db.execute<Replacement>(sql`
        with recursive chain (id, replaced_by, withdrawn_at, slug, title, hops) as (
            select dst.id, dst.replaced_by, dst.withdrawn_at, dst.slug, dst.title, 1
              from ${libraryArtifact} src
              join ${libraryArtifact} dst on dst.id = src.replaced_by
             where src.id = ${id}
            union all
            select dst.id, dst.replaced_by, dst.withdrawn_at, dst.slug, dst.title,
                   chain.hops + 1
              from chain
              join ${libraryArtifact} dst on dst.id = chain.replaced_by
             where chain.withdrawn_at is not null and chain.hops < ${REPLACEMENT_HOPS}
        )
        select slug, title from chain where withdrawn_at is null order by hops limit 1
    `);

    return rows[0] ?? null;
};

/** The artifacts on show, by title, for an admin naming a replacement. */
export const replacementChoices = async (): Promise<ReplacementChoice[]> =>
    db
        .select({ id: libraryArtifact.id, title: libraryArtifact.title })
        .from(libraryArtifact)
        .where(live)
        .orderBy(asc(libraryArtifact.title));

/** Whether artifact `id` is on show. */
export const isArtifactPublished = async (id: string): Promise<boolean> =>
    (
        await db
            .select({ id: libraryArtifact.id })
            .from(libraryArtifact)
            .where(and(eq(libraryArtifact.id, id), live))
    ).length > 0;

/**
 * Points withdrawn artifact `id`'s address at `replacedBy`, or at nothing
 * with null. The caller has checked that `replacedBy` is on show. Answers
 * the slug, or `not_found` for an id no withdrawn artifact has.
 */
export const setReplacement = async (
    id: string,
    replacedBy: string | null,
): Promise<{ slug: string } | 'not_found'> => {
    const [row] = await db
        .update(libraryArtifact)
        .set({ replacedBy })
        .where(and(eq(libraryArtifact.id, id), isNotNull(libraryArtifact.withdrawnAt)))
        .returning({ slug: libraryArtifact.slug });

    return row ?? 'not_found';
};

/** What a publish with `publishKey`, and with `slug` when the publisher
 *  chose one, meets before it makes a share. */
export type PublishTarget = {
    /** The artifact an earlier try with the key made, withdrawn or not, or
     *  null when none did. A withdrawn artifact has no title left, so `title`
     *  is empty and `withdrawn` is true. */
    earlier: { slug: string; title: string; withdrawn: boolean } | null;
    /** Whether another artifact, withdrawn ones included, holds `slug`.
     *  False when `earlier` holds it. */
    slugHeld: boolean;
};

/**
 * Reads the artifact a publish key made and the holder of a chosen slug in
 * one statement, so both come from one snapshot. An earlier try that holds
 * the slug is `earlier` and leaves `slugHeld` false, however its commit
 * interleaves with this publish.
 */
export const publishTarget = async (
    publishKey: string,
    slug?: string | null,
): Promise<PublishTarget> => {
    const rows = await db
        .select({
            publishKey: libraryArtifact.publishKey,
            slug: libraryArtifact.slug,
            title: libraryArtifact.title,
            withdrawn: sql<boolean>`${libraryArtifact.withdrawnAt} is not null`,
        })
        .from(libraryArtifact)
        .where(
            slug
                ? or(eq(libraryArtifact.publishKey, publishKey), eq(libraryArtifact.slug, slug))
                : eq(libraryArtifact.publishKey, publishKey),
        );
    const mine = rows.find((row) => row.publishKey === publishKey);

    return {
        earlier: mine ? { slug: mine.slug, title: mine.title, withdrawn: mine.withdrawn } : null,
        slugHeld: !mine && rows.length > 0,
    };
};

/** Every topic's label, by name. */
export const listTopics = async (): Promise<string[]> =>
    (await db.select({ label: libraryTopic.label }).from(libraryTopic))
        .map((row) => row.label)
        .sort((a, b) => a.localeCompare(b, 'en'));

/** Adds a topic, and answers false when one has that label in any case.
 *  The unique index on `lower(label)` decides, so two adds of one label at
 *  once make one topic. */
export const addTopic = async (label: string): Promise<boolean> =>
    (
        await db
            .insert(libraryTopic)
            .values({ id: uuid(), label })
            .onConflictDoNothing()
            .returning({ id: libraryTopic.id })
    ).length > 0;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Files the artifact under exactly `labels`. False when one of them is not a
// topic, and the transaction is then the caller's to roll back.
const setTopics = async (tx: Tx, artifactId: string, labels: string[]): Promise<boolean> => {
    const topics =
        labels.length > 0
            ? await tx.select().from(libraryTopic).where(inArray(libraryTopic.label, labels))
            : [];

    if (topics.length !== labels.length) {
        return false;
    }

    await tx.delete(libraryArtifactTopic).where(eq(libraryArtifactTopic.artifactId, artifactId));

    if (topics.length > 0) {
        await tx
            .insert(libraryArtifactTopic)
            .values(topics.map((topic) => ({ artifactId, topicId: topic.id })));
    }

    return true;
};

class UnknownTopic extends Error {}

const orUnknownTopic = async <T>(work: Promise<T>): Promise<T | 'unknown_topic'> => {
    try {
        return await work;
    } catch (error) {
        if (error instanceof UnknownTopic) {
            return 'unknown_topic';
        }

        throw error;
    }
};

// Whether the error is Postgres' unique_violation on the slug index, which
// two publishes of one slug raise when they read the taken slugs at the
// same moment. Drizzle wraps the driver's error in `cause`.
const isSlugTaken = (error: unknown): boolean =>
    typeof error === 'object' &&
    error !== null &&
    [error, 'cause' in error ? error.cause : null].some(
        (value) =>
            typeof value === 'object' &&
            value !== null &&
            'code' in value &&
            value.code === '23505' &&
            'constraint' in value &&
            value.constraint === 'library_artifact_slug_idx',
    );

/** An artifact to publish. It holds the publisher's text and the share the
 *  Library made for it with that share's owner token. */
export type ArtifactInsert = ArtifactText & {
    /** The id every try of one publish sends. */
    publishKey: string;
    /** The slug the publisher chose, in `slugOf` form. Without it the slug
     *  is made from the title. */
    slug?: string;
    shareId: string;
    shareWriteToken: string;
    kind: ArtifactKind;
    mode: ArtifactMode;
    sources: LibrarySource[];
    steps: LibraryStep[];
    cardDates: LibraryCardDates[];
};

type Inserted =
    | { slug: string; title: string; created: boolean; withdrawn?: boolean }
    | 'unknown_topic'
    | 'slug_taken';

/**
 * Publishes an artifact under the slug its publisher chose, or else under a
 * slug made from its title, with a number after it when that slug is taken.
 * A slug counts as taken while any artifact holds it, withdrawn ones
 * included. Answers the slug and title with `created: true`,
 * `unknown_topic`, or `slug_taken` when another artifact holds the chosen
 * slug, which gets no number.
 *
 * When an artifact with the same `publishKey` exists, it answers that one's
 * slug and stored title with `created: false` and stores nothing, so the
 * share in `input` is the caller's to take down. When another publish takes
 * the slug first, the insert runs again, up to three times, and a chosen
 * slug then answers `slug_taken`.
 */
export const insertArtifact = async (
    input: ArtifactInsert,
    publishedBy: string,
): Promise<Inserted> => {
    for (let attempt = 1; ; attempt += 1) {
        try {
            return await insertOnce(input, publishedBy);
        } catch (error) {
            if (!isSlugTaken(error)) {
                throw error;
            }

            if (attempt === 3) {
                if (input.slug) {
                    return 'slug_taken';
                }

                throw error;
            }
        }
    }
};

const insertOnce = (input: ArtifactInsert, publishedBy: string): Promise<Inserted> =>
    orUnknownTopic(
        db.transaction(async (tx): Promise<Inserted> => {
            const { topics, slug: chosen, ...fields } = input;
            let slug: string;

            if (chosen) {
                // The holder may be an earlier try of this publish, which
                // the insert below answers.
                const [holder] = await tx
                    .select({ publishKey: libraryArtifact.publishKey })
                    .from(libraryArtifact)
                    .where(eq(libraryArtifact.slug, chosen));

                if (holder && holder.publishKey !== input.publishKey) {
                    return 'slug_taken';
                }

                slug = chosen;
            } else {
                const base = slugOf(input.title);
                const taken = await tx
                    .select({ slug: libraryArtifact.slug })
                    .from(libraryArtifact)
                    .where(like(libraryArtifact.slug, `${base}%`));

                slug = freeSlug(base, new Set(taken.map((row) => row.slug)));
            }

            const id = uuid();

            // A publish with this key that commits first wins, and this
            // insert then waits for it and does nothing.
            const [made] = await tx
                .insert(libraryArtifact)
                .values({ id, slug, publishedBy, ...fields })
                .onConflictDoNothing({ target: libraryArtifact.publishKey })
                .returning({ slug: libraryArtifact.slug });

            if (!made) {
                const [first] = await tx
                    .select({
                        slug: libraryArtifact.slug,
                        title: libraryArtifact.title,
                        withdrawnAt: libraryArtifact.withdrawnAt,
                    })
                    .from(libraryArtifact)
                    .where(eq(libraryArtifact.publishKey, input.publishKey));

                return {
                    slug: first.slug,
                    title: first.title,
                    created: false,
                    withdrawn: first.withdrawnAt !== null,
                };
            }

            if (!(await setTopics(tx, id, topics))) {
                throw new UnknownTopic();
            }

            return { slug, title: input.title, created: true };
        }),
    );

/**
 * Changes an artifact's text and topics. Its slug stays, since the URL is
 * what readers cite. Answers `not_found` for an id no artifact on show has.
 */
export const updateArtifact = (
    id: string,
    { topics, ...fields }: ArtifactText,
): Promise<{ slug: string } | 'not_found' | 'unknown_topic'> =>
    orUnknownTopic(
        db.transaction(async (tx) => {
            const [row] = await tx
                .update(libraryArtifact)
                .set({ ...fields, updatedAt: new Date() })
                .where(and(eq(libraryArtifact.id, id), live))
                .returning({ slug: libraryArtifact.slug });

            if (!row) {
                return 'not_found' as const;
            }

            if (!(await setTopics(tx, id, topics))) {
                throw new UnknownTopic();
            }

            return row;
        }),
    );

/** The text fields of artifact `id` while it is on show, else null. The
 *  edit route checks the fields an edit changes against them. */
export const artifactText = async (id: string): Promise<Omit<ArtifactText, 'topics'> | null> => {
    const [row] = await db
        .select({
            title: libraryArtifact.title,
            description: libraryArtifact.description,
            contentTitle: libraryArtifact.contentTitle,
            content: libraryArtifact.content,
        })
        .from(libraryArtifact)
        .where(and(eq(libraryArtifact.id, id), live));

    return row ?? null;
};

/** An artifact's slug and the share the Library made for it, with that
 *  share's owner token. */
export type ArtifactShare = { slug: string; shareId: string; shareWriteToken: string };

/** The share of artifact `id`, while its row holds the share's token, else
 *  null. Only the withdrawal reads the token. */
export const artifactShare = async (id: string): Promise<ArtifactShare | null> => {
    const [row] = await db
        .select({
            slug: libraryArtifact.slug,
            shareId: libraryArtifact.shareId,
            shareWriteToken: libraryArtifact.shareWriteToken,
        })
        .from(libraryArtifact)
        .where(and(eq(libraryArtifact.id, id), isNotNull(libraryArtifact.shareWriteToken)));

    return row?.shareWriteToken ? { ...row, shareWriteToken: row.shareWriteToken } : null;
};

/** Whether artifact `id` is withdrawn. False for an id no artifact has. */
export const isArtifactWithdrawn = async (id: string): Promise<boolean> =>
    (
        await db
            .select({ id: libraryArtifact.id })
            .from(libraryArtifact)
            .where(and(eq(libraryArtifact.id, id), isNotNull(libraryArtifact.withdrawnAt)))
    ).length > 0;

/**
 * Withdraws an artifact and drops its share token, in one statement. Call it
 * only once the share is gone from dfo-apis or its `share_cleanup` record
 * has committed (./withdraw.ts), since the token is the only way to take the
 * share down again.
 *
 * The database erases what it published: the
 * `library_artifact_erase_withdrawn` trigger (db/migrations/0033) blanks the
 * title and description, clears the content title, content, sources and
 * steps, and deletes the topic links of any row written with `withdrawn_at`
 * set, so every writer erases, an older release's included. This sets
 * `withdrawn_at` and leaves the erasure to that trigger, which keeps one
 * definition of what withdrawal erases.
 *
 * The row keeps its id, slug, kind, mode, dates, publisher, share id and
 * publish key. The slug stays taken, so a cited URL keeps naming this
 * artifact, and the address says it was withdrawn and when. The publish key
 * makes a retried publish answer `artifact_withdrawn`. The share id names
 * the share an operator looks up. Lists, the sitemap and edits leave the row
 * out.
 *
 * `replacedBy` names the artifact its address then links to, which the
 * caller has checked is on show (`setReplacement` changes it later).
 *
 * Answers the slug, or `not_found` for an id no artifact has and for one
 * whose token is gone, a withdrawn one included. A withdrawn row that still
 * holds a token keeps its first withdrawal date.
 */
export const withdrawArtifact = async (
    id: string,
    replacedBy: string | null = null,
): Promise<{ slug: string } | 'not_found'> => {
    const [row] = await db
        .update(libraryArtifact)
        .set({
            withdrawnAt: sql`coalesce(${libraryArtifact.withdrawnAt}, now())`,
            shareWriteToken: null,
            replacedBy,
        })
        .where(and(eq(libraryArtifact.id, id), isNotNull(libraryArtifact.shareWriteToken)))
        .returning({ slug: libraryArtifact.slug });

    return row ?? 'not_found';
};
