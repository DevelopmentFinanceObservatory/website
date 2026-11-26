import 'server-only';

import { asc, desc, eq, inArray, like } from 'drizzle-orm';
import { cache } from 'react';

import {
    libraryArtifact,
    libraryArtifactTopic,
    libraryTopic,
    type LibraryArtifactRow,
} from '../../../db/schema.ts';

import type { ArtifactKind, ArtifactMode, LibraryArtifact } from './artifact.ts';
import { type ArtifactText, freeSlug, type PublishInput, slugOf } from './publish.ts';

import { db } from '@/lib/db';
import { uuid } from '@/lib/uuid';

/**
 * The Library's artifacts, read from the website's own tables (db/schema.ts,
 * `library_artifact`), newest first, each with its topics by name, and the
 * writes behind publishing, editing and deleting one. The writes trust their
 * caller: ./admin.ts checks who asks and narrows what they send.
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

// The check constraints on `kind` and `mode` hold the values to these.
const toArtifact = (row: LibraryArtifactRow, topics: string[]): LibraryArtifact => ({
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
    publishedAt: row.publishedAt.toISOString(),
});

/** Every artifact, newest first. */
export const listArtifacts = async (): Promise<LibraryArtifact[]> => {
    const rows = await db.select().from(libraryArtifact).orderBy(desc(libraryArtifact.publishedAt));
    const topics = await topicsOf(rows.map((row) => row.id));

    return rows.map((row) => toArtifact(row, topics.get(row.id) ?? []));
};

/** The artifact published under `slug`, or null. One read per request,
 *  however many readers (the page and its metadata). */
export const artifactBySlug = cache(async (slug: string): Promise<LibraryArtifact | null> => {
    const [row] = await db.select().from(libraryArtifact).where(eq(libraryArtifact.slug, slug));

    if (!row) {
        return null;
    }

    return toArtifact(row, (await topicsOf([row.id])).get(row.id) ?? []);
});

/** Every topic's label, by name. */
export const listTopics = async (): Promise<string[]> =>
    (await db.select({ label: libraryTopic.label }).from(libraryTopic))
        .map((row) => row.label)
        .sort((a, b) => a.localeCompare(b, 'en'));

/** Adds a topic, and answers false when one has that label in any case. */
export const addTopic = async (label: string): Promise<boolean> => {
    const taken = (await listTopics()).some((other) => other.toLowerCase() === label.toLowerCase());

    if (taken) {
        return false;
    }

    await db.insert(libraryTopic).values({ id: uuid(), label }).onConflictDoNothing();

    return true;
};

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

// Postgres' unique_violation, which the slug index raises when two publishes
// of one title read the taken slugs at the same moment.
const isUniqueViolation = (error: unknown): boolean =>
    typeof error === 'object' &&
    error !== null &&
    [error, 'cause' in error ? error.cause : null].some(
        (value) =>
            typeof value === 'object' &&
            value !== null &&
            'code' in value &&
            value.code === '23505',
    );

/**
 * Publishes an artifact under a slug made from its title, with a number
 * after it when the slug is taken. Answers the slug, or `unknown_topic`. A
 * slug another publish took first is chosen again, up to three times.
 */
export const insertArtifact = async (
    input: PublishInput,
    publishedBy: string,
): Promise<{ slug: string } | 'unknown_topic'> => {
    for (let attempt = 1; ; attempt += 1) {
        try {
            return await insertOnce(input, publishedBy);
        } catch (error) {
            if (attempt === 3 || !isUniqueViolation(error)) {
                throw error;
            }
        }
    }
};

const insertOnce = (
    input: PublishInput,
    publishedBy: string,
): Promise<{ slug: string } | 'unknown_topic'> =>
    orUnknownTopic(
        db.transaction(async (tx) => {
            const base = slugOf(input.title);
            const taken = await tx
                .select({ slug: libraryArtifact.slug })
                .from(libraryArtifact)
                .where(like(libraryArtifact.slug, `${base}%`));
            const slug = freeSlug(base, new Set(taken.map((row) => row.slug)));
            const id = uuid();
            const { topics, ...fields } = input;

            await tx.insert(libraryArtifact).values({ id, slug, publishedBy, ...fields });

            if (!(await setTopics(tx, id, topics))) {
                throw new UnknownTopic();
            }

            return { slug };
        }),
    );

/**
 * Changes an artifact's text and topics. Its slug stays, since the URL is
 * what readers cite. Answers `not_found` for an id no artifact has.
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
                .where(eq(libraryArtifact.id, id))
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

/** Deletes an artifact and its topic rows. False for an id no artifact has. */
export const removeArtifact = async (id: string): Promise<boolean> =>
    (
        await db
            .delete(libraryArtifact)
            .where(eq(libraryArtifact.id, id))
            .returning({ id: libraryArtifact.id })
    ).length > 0;
