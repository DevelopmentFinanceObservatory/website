import { withHarnessPins } from './canvasEdits.ts';
import type { CompositionManifest, MutationOperation } from './wire';

import { isHarnessCard, legacyCanvasWidgetsOf, type CanvasState } from '../chat/canvas.ts';

/** The harness canvas this page last saw: which composition, at which
 *  revision, holding which cards, and which of them the manifest pins
 *  (`pinned`, absent on a legacy canvas and on a baseline saved before the
 *  page kept it). A null `compositionId` marks a legacy canvas, the cards a
 *  save from before the page kept the manifest showed, which createLegacyCanvas
 *  brings to the harness's manifest. */
export type CanvasBaseline = {
    compositionId: string | null;
    revision: number;
    ids: string[];
    pinned?: string[];
};

/** The canvas a save reopens with: its saved baseline, else, for a save
 *  from before the page kept the manifest, a legacy canvas of the harness
 *  cards it showed. A fork's inherited cards (`localIds`) are no harness
 *  cards, so the baseline leaves them out. */
export const restoreCanvas = (
    saved:
        | ({ sessionId: string | null; canvas?: CanvasBaseline | null } & Pick<
              CanvasState,
              'widgets'
          > &
              Partial<Omit<CanvasState, 'widgets'>>)
        | undefined,
): CanvasBaseline | null => {
    if (!saved?.sessionId) {
        return null;
    }

    if (saved.canvas) {
        return saved.canvas;
    }

    const removed = new Set([...(saved.removedIds ?? []), ...(saved.localIds ?? [])]);

    return {
        compositionId: null,
        revision: -1,
        ids: legacyCanvasWidgetsOf({
            widgets: saved.widgets,
            pinnedIds: saved.pinnedIds ?? [],
            graceIds: saved.graceIds,
            graceTurn: saved.graceTurn,
        })
            .filter((widget) => !removed.has(widget.id))
            .map((widget) => widget.id),
    };
};

/** A manifest taken as the new baseline (takeManifest), with the cards the
 *  page should keep as local cards (`local`). */
export type TakenManifest = { baseline: CanvasBaseline; local: string[] };

/**
 * Take a canvas manifest as the new baseline, or null for a manifest of the
 * same composition no newer than the baseline (a frame or response arriving
 * late), which changes nothing. Within one composition a card the manifest
 * lacks is one the harness removed. A manifest of another composition (a
 * forked conversation's new session, or a session the harness started
 * afresh under the same id) holds none of the old baseline's cards, so the
 * ones it lacks come back as `local`. The page keeps them, and the new
 * session's manifests cannot take them off. The first manifest after a
 * legacy canvas returns no `local`, since createLegacyCanvas decides those.
 */
export const takeManifest = (
    previous: CanvasBaseline | null,
    manifest: CompositionManifest,
): TakenManifest | null => {
    if (
        previous?.compositionId === manifest.composition_id &&
        manifest.revision <= previous.revision
    ) {
        return null;
    }

    const ids = manifest.blocks.map((block) => block.component_id);
    const held = new Set(ids);
    const replaced =
        previous?.compositionId != null && previous.compositionId !== manifest.composition_id;

    return {
        baseline: {
            compositionId: manifest.composition_id,
            revision: manifest.revision,
            ids,
            pinned: manifest.blocks
                .filter((block) => block.pinned)
                .map((block) => block.component_id),
        },
        local: replaced ? previous.ids.filter((id) => !held.has(id)) : [],
    };
};

/**
 * The baseline less the cards among `ids` it holds, for `remove` edits the
 * harness refused with "no block". The baseline's cards came from a manifest
 * of this composition, so the harness held each once and has since removed
 * it. The revision stays, so the next manifest is taken. Null when the
 * baseline is legacy or holds none of `ids`, since the harness never held
 * those cards (createLegacyCanvas's `unheld`).
 */
export const withoutRemovedCards = (
    baseline: CanvasBaseline | null,
    ids: readonly string[],
): CanvasBaseline | null => {
    if (baseline?.compositionId == null || !ids.some((id) => baseline.ids.includes(id))) {
        return null;
    }

    const gone = new Set(ids);

    return {
        ...baseline,
        ids: baseline.ids.filter((id) => !gone.has(id)),
        ...(baseline.pinned ? { pinned: baseline.pinned.filter((id) => !gone.has(id)) } : {}),
    };
};

/**
 * The cards a legacy save (see restoreCanvas) holds that its canvas hid, with
 * the revision the save held each at (`revisions`, restoreCardRevisions), or
 * null where the save does not know it. These are its widgets less the ones
 * it showed and less a fork's named inherited cards.
 */
export const legacyHiddenCards = (
    saved: { widgets: readonly { id: string }[]; localIds?: readonly string[] },
    baseline: CanvasBaseline,
    revisions: ReadonlyMap<string, number>,
): Map<string, number | null> => {
    const shown = new Set([...baseline.ids, ...(saved.localIds ?? [])]);

    return new Map(
        saved.widgets
            .filter((widget) => !shown.has(widget.id))
            .map((widget) => [widget.id, revisions.get(widget.id) ?? null] as const),
    );
};

/** The cards a legacy canvas's save holds that no harness turn produced,
 *  so the harness never held them (a fork's inherited cards): the ones the
 *  page showed, and the ones it hid, which stay off the canvas. */
export type LegacyLocal = { shown: string[]; hidden: string[] };

/** The cards that turn local when the page leaves its harness session, as a
 *  fork's do (forkedCanvas). Every card of the conversation turns local, the
 *  ones the harness's canvas showed (`canvasIds`) shown and the rest hidden,
 *  so Add brings a hidden one back on the page alone. withLocalCards leaves a
 *  card that is local already as it is. */
export const sessionLeftCards = (
    canvasIds: readonly string[],
    widgets: readonly { id: string }[],
): LegacyLocal => ({
    shown: [...canvasIds],
    hidden: widgets.map((widget) => widget.id).filter((id) => !canvasIds.includes(id)),
});

/**
 * A legacy canvas (see CanvasBaseline) while the harness's manifest is
 * brought to it. The harness holds every card such a conversation drew,
 * because the page that saved it never reported the cards its turn rule hid.
 * The first manifest `offer`ed waits for `produced`: the ids of every card a
 * turn of the harness session drew, from all its closed turns since turn 0
 * plus the cards of a turn left paused or running, or null when they could
 * not be read, which leaves the canvas legacy. A manifest offered meanwhile
 * replaces an older one. The manifest then taken gets one `remove` for each
 * card the save hid (`hidden`, legacyHiddenCards) that the manifest holds at
 * no newer revision than the save did, against the manifest's revision
 * (`expected_revision`). A card the save never held, such as one another
 * tab's turn drew since, one revised since the save, and one whose saved
 * revision is unknown, stays.
 * The same request sends a `pin` for each card the save showed pinned
 * (`pinned`) that the manifest holds unpinned, since the page that saved it
 * kept its pins to itself. `onTake` hears the manifest that
 * answers, then any later one offered meanwhile, as the canvas to take from
 * then on. Before it, `onLocal` hears the cards the save held that no
 * harness turn produced, such as a fork's inherited ones, which stay on the
 * page as local cards, those the page hid or the user took off and the
 * harness refused to remove (`unheld`) staying off the canvas. A card a turn
 * produced that the manifest lacks is one the harness removed, so it leaves
 * the canvas.
 * Until then the canvas shows `ids()`: the legacy cards plus the cards drawn
 * since (`keep`), less the ones the user took off (`drop`), and `onChange`
 * hears each change. A failed `remove`, a stale revision included, leaves
 * the canvas legacy, so the save stays legacy and the next open tries again
 * against the manifest it then reads.
 */
export const createLegacyCanvas = ({
    ids,
    hidden,
    pinned,
    produced,
    mutate,
    onTake,
    onLocal,
    onChange,
}: {
    ids: readonly string[];
    hidden: ReadonlyMap<string, number | null>;
    pinned: readonly string[];
    produced: Promise<ReadonlySet<string> | null>;
    mutate: (
        operations: MutationOperation[],
        expectedRevision: number,
    ) => Promise<CompositionManifest | null>;
    onTake: (manifest: CompositionManifest) => void;
    onLocal: (local: LegacyLocal) => void;
    onChange: (ids: string[]) => void;
}) => {
    const shown = new Set(ids);
    // The cards the user took off whose `remove` the harness refused, since
    // it never held them (a fork's inherited card). Each stays local and off
    // the canvas.
    const unheld = new Set<string>();
    let state: 'waiting' | 'reading' | 'sent' | 'failed' | 'taken' = 'waiting';
    // The newest manifest offered while `produced` was read or the `remove`
    // was in flight.
    let later: CompositionManifest | null = null;
    // The cards of the manifest taken.
    let taken: ReadonlySet<string> = new Set();
    // The cards the harness session's turns drew, once read.
    let drawn: ReadonlySet<string> = new Set();

    const newest = (manifest: CompositionManifest) =>
        later && later.revision >= manifest.revision ? later : manifest;

    const take = (manifest: CompositionManifest, local: LegacyLocal) => {
        state = 'taken';
        taken = new Set(manifest.blocks.map((block) => block.component_id));

        if (local.shown.length > 0 || local.hidden.length > 0) {
            onLocal(local);
        }

        onTake(manifest);

        if (later && later.revision > manifest.revision) {
            onTake(later);
        }

        later = null;
    };

    const bring = async (manifest: CompositionManifest): Promise<void> => {
        const held = new Set(manifest.blocks.map((block) => block.component_id));
        const ownless = (id: string) => !held.has(id) && !drawn.has(id);
        const local = {
            shown: [...shown].filter(ownless),
            hidden: [...new Set([...hidden.keys(), ...unheld])].filter(
                (id) => !shown.has(id) && ownless(id),
            ),
        };
        const removed = manifest.blocks
            .filter((block) => {
                const revision = hidden.get(block.component_id);

                return (
                    revision !== undefined &&
                    revision !== null &&
                    block.revision <= revision &&
                    !shown.has(block.component_id)
                );
            })
            .map((block) => block.component_id);
        const pins = manifest.blocks
            .filter(
                (block) =>
                    !block.pinned &&
                    pinned.includes(block.component_id) &&
                    shown.has(block.component_id),
            )
            .map((block) => block.component_id);
        const operations: MutationOperation[] = [
            ...removed.map((id) => ({ op: 'remove' as const, component_id: id })),
            ...pins.map((id) => ({ op: 'pin' as const, component_id: id })),
        ];

        if (operations.length === 0) {
            take(manifest, local);

            return;
        }

        state = 'sent';

        const answer = await mutate(operations, manifest.revision).catch((error: unknown) => {
            console.warn('Studio: a legacy canvas was not brought to the harness', error);

            return null;
        });

        if (answer) {
            take(answer, local);
        } else {
            state = 'failed';
            later = null;
        }
    };

    return {
        ids: (): string[] => [...shown],
        keep: (id: string) => {
            if (state !== 'taken' && !shown.has(id)) {
                unheld.delete(id);
                shown.add(id);
                onChange([...shown]);
            }
        },
        drop: (id: string) => {
            if (state !== 'taken' && shown.delete(id)) {
                onChange([...shown]);
            }
        },
        // The harness refused the `remove` of card `id`, which it never held.
        // Before the take, the take makes it local; after it, a card the
        // taken manifest lacks and no turn drew is made local at once.
        unheld: (id: string) => {
            if (shown.has(id)) {
                return;
            }

            if (state !== 'taken') {
                unheld.add(id);
            } else if (!taken.has(id) && !drawn.has(id)) {
                onLocal({ shown: [], hidden: [id] });
            }
        },
        offer: async (manifest: CompositionManifest): Promise<void> => {
            if (state === 'taken' || state === 'failed') {
                return;
            }

            if (state === 'sent' || state === 'reading') {
                later = newest(manifest);

                return;
            }

            state = 'reading';
            later = manifest;

            const read = await produced.catch((error: unknown) => {
                console.warn('Studio: the cards of a legacy canvas were not read', error);

                return null;
            });
            const offered = later ?? manifest;

            later = null;

            if (!read) {
                state = 'failed';

                return;
            }

            drawn = read;
            await bring(offered);
        },
    };
};

export type LegacyCanvas = ReturnType<typeof createLegacyCanvas>;

/** A canvas document's say over its cards: which are pinned, which the
 *  harness never held (`localIds`), and which of those the user took off
 *  (`removedIds`). One state, so a pin taken from a manifest reads the local
 *  cards a change in the same render made. */
export type CardMarks = { pinnedIds: string[]; removedIds: string[]; localIds: string[] };

/** `marks` with the cards the harness turned out never to hold (useChat's
 *  localCards). `shown` ones stay on the canvas and `hidden` ones go off it.
 *  A card `marks` holds local already keeps whether it shows. Unchanged when
 *  it holds them all already. */
export const withLocalCards = (
    marks: CardMarks,
    shown: readonly string[],
    hidden: readonly string[] = [],
): CardMarks => {
    const local = [...shown, ...hidden].filter((id) => !marks.localIds.includes(id));
    const removed = hidden.filter(
        (id) => !marks.removedIds.includes(id) && !marks.localIds.includes(id),
    );

    return local.length === 0 && removed.length === 0
        ? marks
        : {
              ...marks,
              localIds: [...marks.localIds, ...local],
              removedIds: [...marks.removedIds, ...removed],
          };
};

/** `marks` with the harness cards' pins taken from the manifest's (`pins`),
 *  the pins of the cards `marks` holds local kept (withHarnessPins).
 *  Unchanged when they already agree. */
export const withManifestPins = (
    marks: CardMarks,
    pins: readonly string[],
    widgets: readonly { id: string }[],
): CardMarks => {
    const pinnedIds = withHarnessPins(marks.pinnedIds, pins, (id) =>
        isHarnessCard({ widgets, localIds: marks.localIds }, id),
    );

    return pinnedIds === marks.pinnedIds ? marks : { ...marks, pinnedIds };
};
