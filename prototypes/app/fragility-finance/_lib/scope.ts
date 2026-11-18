// What the page shows: a group of contexts (all 62 or one tier) or one context, and the
// contexts behind it.
import type { Context, GroupKey, Tier } from '../_data/types.ts';

export type Scope = { kind: 'group'; key: GroupKey } | { kind: 'context'; iso3: string };

/** The segmented control's order. */
export const GROUP_KEYS: readonly GroupKey[] = ['all', 'extreme', 'high'];

/** The page opens on all 62. */
export const DEFAULT_SCOPE: Scope = { kind: 'group', key: 'all' };

export const TIER_LABELS: Record<Tier, string> = {
    extreme: 'Extreme fragility',
    high: 'High fragility',
};

export const inGroup = (context: Context, key: GroupKey): boolean =>
    key === 'all' || context.tier === key;

/** The contexts in a group, in the order given. */
export const groupContexts = (contexts: readonly Context[], key: GroupKey): Context[] =>
    contexts.filter((context) => inGroup(context, key));

/** A context is compared with the contexts of its own tier. */
export const comparisonGroup = (context: Context): GroupKey => context.tier;

export const findContext = (contexts: readonly Context[], iso3: string): Context | undefined =>
    contexts.find((context) => context.iso3 === iso3);

/** The contexts a scope sums over: the group's members, or the one context. */
export const scopeContexts = (contexts: readonly Context[], scope: Scope): Context[] => {
    if (scope.kind === 'group') {
        return groupContexts(contexts, scope.key);
    }

    const context = findContext(contexts, scope.iso3);

    return context === undefined ? [] : [context];
};

/** The group a scope's strips take their median from and dim the other dots against. */
export const scopeGroup = (contexts: readonly Context[], scope: Scope): GroupKey => {
    if (scope.kind === 'group') {
        return scope.key;
    }

    const context = findContext(contexts, scope.iso3);

    return context === undefined ? 'all' : comparisonGroup(context);
};

/**
 * The scope after a click on a context's dot: the context, or `group` when that context
 * is already selected.
 */
export const toggleContext = (scope: Scope, iso3: string, group: GroupKey): Scope =>
    scope.kind === 'context' && scope.iso3 === iso3
        ? { kind: 'group', key: group }
        : { kind: 'context', iso3 };

const GROUP_NAMES: Record<GroupKey, string> = { all: 'All', extreme: 'Extreme', high: 'High' };

/** A segment of the scope control: "All 62", "Extreme 20", "High 42". */
export const groupLabel = (contexts: readonly Context[], key: GroupKey): string =>
    `${GROUP_NAMES[key]} ${groupContexts(contexts, key).length}`;

/** The group in running text: "the 62 contexts", "the 20 contexts in extreme fragility". */
export const groupNoun = (contexts: readonly Context[], key: GroupKey): string => {
    const count = groupContexts(contexts, key).length;

    return key === 'all' ? `the ${count} contexts` : `the ${count} contexts in ${key} fragility`;
};

const fold = (text: string): string =>
    text
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase();

/**
 * Contexts matching `query`, extreme before high. Within each tier, names that start with
 * it come first, then names with a word that starts with it, then names that contain it,
 * each by name. An empty query matches every context.
 */
export const matchContexts = (contexts: readonly Context[], query: string): Context[] => {
    const q = fold(query.trim());
    const rank = (name: string): number => {
        const folded = fold(name);

        if (folded.startsWith(q)) {
            return 0;
        }

        if (folded.split(/[\s'-]+/).some((word) => word.startsWith(q))) {
            return 1;
        }

        return folded.includes(q) ? 2 : 3;
    };

    return contexts
        .map((context) => ({ context, score: rank(context.name) }))
        .filter(({ score }) => score < 3)
        .toSorted(
            (a, b) =>
                Number(a.context.tier === 'high') - Number(b.context.tier === 'high') ||
                a.score - b.score ||
                a.context.name.localeCompare(b.context.name),
        )
        .map(({ context }) => context);
};
