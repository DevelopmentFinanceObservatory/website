/**
 * Reads of the Datasets members door (`fetchDefinitionMembers`) for the
 * panels that list or name a Spec's served StatVars: the "About this
 * answer" panel and a measure token's About line. Each Spec is read once
 * and the promise shared by every caller, keyed by `spec_id` and the
 * answer's `shape.member_digest`. The `spec_id` hashes the definition, and
 * the digest changes when the family's membership does under the same
 * definition. A Spec without a digest (Search did not settle the family)
 * cannot say whether its membership changed, so each call asks again. A
 * refused or failed read resolves `{ ok: false }` and leaves the cache, so
 * the next panel open asks again. Each member comes back as its bare dcid
 * and label, the form the panels show and compare.
 *
 * This module has no DOM dependency, so `node --test` can import it directly.
 */

import { fetchDefinitionMembers } from './searchClient.ts';
import type { Spec } from './types.ts';

/** A served StatVar as the panels read it: its bare dcid and label. */
export type MemberRef = { dcid: string; label: string | null };

export type MembersRead = { ok: true; members: MemberRef[] } | { ok: false };

/** The part of a page Spec the reader keys on and sends. */
export type MemberSpec = Pick<Spec, 'spec_id'> &
    Partial<Pick<Spec, 'definition'>> & {
        shape?: Partial<Pick<Spec['shape'], 'member_digest'>> | null;
    };

type FetchMembers = typeof fetchDefinitionMembers;

export const definitionMembersReader = (fetchMembers: FetchMembers = fetchDefinitionMembers) => {
    const cache = new Map<string, Promise<MembersRead>>();

    return (spec: MemberSpec): Promise<MembersRead> => {
        const digest = spec.shape?.member_digest;
        const key = digest ? `${spec.spec_id}\n${digest}` : null;
        const cached = key ? cache.get(key) : undefined;

        if (cached) return cached;

        const pending = fetchMembers({ spec_id: spec.spec_id, definition: spec.definition }).then(
            (body): MembersRead => ({
                ok: true,
                members: body.members.map((member) => ({
                    dcid: member.ref.replace(/^dcid:/, ''),
                    label: member.label,
                })),
            }),
            (): MembersRead => {
                if (key) cache.delete(key);
                return { ok: false };
            },
        );

        if (key) cache.set(key, pending);
        return pending;
    };
};
