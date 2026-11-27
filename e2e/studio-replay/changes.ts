/**
 * The harness's answers to a card change, built from the card frames a
 * scenario recorded. An admitted change streams the frames of the harness's
 * change flow: steps u1 "Read the card", u2 "Read the data …" and u3
 * "Redraw the card", a `component.created` for a new card id that
 * `replaces` the old one with fresh offers and the old card's plan link,
 * `composition.updated` and `done`. The harness keeps the closing sentence
 * in the turn's record, so the stream sends no `message.complete`. A
 * refused change is a 422 `constraint_violation` with the harness's own
 * `detail` sentence.
 *
 * The new card keeps every recorded figure. A change of years keeps the
 * recorded points inside the new years. A change of unit names the new
 * unit where the payload names one and keeps the values, as the recorded
 * unit-change frame (src/lib/studio/test/fixtures/event-19) does. The new
 * card's offers name a new spec, `<old spec>_<new card id>`, as the
 * harness's offers name the spec the redraw resolved.
 */
import type { CardChange, ChangeAnswer, Player } from './harness.ts';
import type { Frame, Manifest } from './scenario.ts';

type Window = { start_year: number; end_year: number };
type Unit = { currency: string; prices: string; base_year?: number };
type Envelope = {
    component_id: string;
    revision: number;
    description?: {
        describes?: { kind: string; component_id?: string; revision?: number };
        title?: string;
        about?: { period?: object; drawn?: { period?: object } };
    };
    component: {
        title: { text: string };
        series?: { unit?: object; points: { period: string; value: number | null }[] }[];
        x_axis?: { window?: { start: string; end: string } };
    };
};

/** A 422 refusal in the harness's shape. */
export const refused = (constraintId: string, detail: string, pointer: string): ChangeAnswer => ({
    refusal: {
        status: 422,
        body: {
            error: 'constraint_violation',
            retry: 'do_not_retry',
            detail,
            constraint_id: constraintId,
            pointer,
        },
    },
});

// "2010 to 2024" where `text` states the old years, as the harness
// retitles a card whose years changed.
const retitled = (text: string, [was, wasEnd]: number[], [start, end]: number[]) =>
    text.replace(`${was} to ${wasEnd}`, `${start} to ${end}`);

const step = (id: string, label: string, produced: unknown = null): Frame => ({
    event: 'activity.step',
    seq: 0,
    step_id: id,
    label,
    status: 'complete',
    detail: null,
    tool: null,
    duration_ms: null,
    produced,
    progress: null,
});

// The change flow's frames for card `old` redrawn as `envelope` under
// `id`, on the canvas `manifest`.
const redrawn = (
    old: Frame,
    manifest: Manifest,
    {
        id,
        label,
        envelope,
        facts,
        offers,
    }: {
        id: string;
        label: string;
        envelope: Envelope;
        facts: Record<string, unknown>;
        offers: Record<string, unknown>;
    },
): Frame[] => {
    const from = old.created_from as Record<string, unknown>;
    const blocks = manifest.blocks.map((block) =>
        block.component_id === old.component_id
            ? { ...block, component_id: id, revision: 1, title: envelope.component.title.text }
            : block,
    );
    const canvas = { ...manifest, revision: manifest.revision + 1, actor: 'model', blocks };
    const frames: Frame[] = [
        step('u1', 'Read the card'),
        step('u2', label),
        step('u3', 'Redraw the card', { component_id: id, revision: 1 }),
        {
            ...old,
            component_id: id,
            revision: 1,
            payload: envelope,
            fact_summary: { ...facts, component_id: id, revision: 1 },
            created_from: {
                step_id: 'u3',
                message_seq: null,
                ...(from.plan_version_id !== undefined && {
                    plan_version_id: from.plan_version_id,
                    plan_step_id: from.plan_step_id,
                }),
            },
            ...offers,
            replaces: old.component_id,
        },
        { event: 'composition.updated', seq: 0, manifest: canvas },
        { event: 'done', seq: 0, trace_id: `tr_replay_${id}`, composition: canvas },
    ];

    return frames.map((frame, seq) => ({ ...frame, seq }));
};

// The recorded card the request names, with its envelope copied under `id`.
const cardOf = (player: Player, componentId: string, id: string) => {
    const old = player.card(componentId);
    const manifest = player.canvas;

    if (!old || !manifest) {
        throw new Error(`no recorded card ${componentId} on the canvas`);
    }

    const envelope = structuredClone(old.payload) as unknown as Envelope;

    envelope.component_id = id;
    envelope.revision = 1;

    if (envelope.description?.describes?.kind === 'card_revision') {
        envelope.description.describes = { kind: 'card_revision', component_id: id, revision: 1 };
    }

    return {
        old,
        manifest,
        envelope,
        facts: structuredClone(old.fact_summary) as Record<string, unknown>,
    };
};

// The card's offers under the new spec, with `patch` applied to each.
const offersOf = (old: Frame, id: string, patch: { window?: Window; start?: Unit }) => {
    const changes = old.card_changes as { spec_id: string; window?: object } | undefined;
    const unit = old.unit_change as { spec_id: string; offer: object } | undefined;
    const spec = (from: string) => `${from}_${id}`;

    return {
        ...(changes && {
            card_changes: {
                ...changes,
                spec_id: spec(changes.spec_id),
                ...(changes.window &&
                    patch.window && {
                        window: { ...changes.window, ...patch.window },
                    }),
            },
        }),
        ...(unit && {
            unit_change: {
                ...unit,
                spec_id: spec(unit.spec_id),
                ...(patch.start && { offer: { ...unit.offer, start: patch.start } }),
            },
        }),
    };
};

/** An admitted change of years (`apply_change` of kind `window`) of a
 *  recorded line chart, drawn as card `id`. */
export const yearsRedraw = (
    player: Player,
    request: Record<string, unknown>,
    id: string,
): ChangeAnswer => {
    const ask = request.apply_change as {
        component_id: string;
        change: { start_year: number; end_year: number };
    };
    const { start_year: start, end_year: end } = ask.change;
    const { old, manifest, envelope, facts } = cardOf(player, ask.component_id, id);
    const was = (old.card_changes as { window: Window }).window;
    const years = [was.start_year, was.end_year];
    const shown = start === end ? `${start}` : `${start} to ${end}`;
    const inside = (period: string) =>
        Number(period.slice(0, 4)) >= start && Number(period.slice(0, 4)) <= end;
    const component = envelope.component;
    const title = component.title.text;

    for (const series of component.series ?? []) {
        series.points = series.points.filter((point) => inside(point.period));
    }

    if (component.x_axis?.window) {
        component.x_axis.window = { start: String(start), end: String(end) };
    }

    component.title.text = retitled(component.title.text, years, [start, end]);

    if (envelope.description?.title) {
        envelope.description.title = retitled(envelope.description.title, years, [start, end]);
    }

    for (const about of [envelope.description?.about, envelope.description?.about?.drawn]) {
        if (about?.period) {
            about.period = { ...about.period, start: String(start), end: String(end) };
        }
    }

    const change: CardChange = { component_id: ask.component_id, kind: 'window' };

    return {
        frames: redrawn(old, manifest, {
            id,
            label: `Read the data for ${shown}`,
            envelope,
            facts: { ...facts, window: { start: String(start), end: String(end) } },
            offers: offersOf(old, id, { window: { start_year: start, end_year: end } }),
        }),
        userMessage: `Change ${title} to ${shown}.`,
        change,
    };
};

/** An admitted change of unit (`apply_unit`) of a recorded card, drawn as
 *  card `id`, in words `words` ("euros"). */
export const unitRedraw = (
    player: Player,
    request: Record<string, unknown>,
    id: string,
    words: string,
): ChangeAnswer => {
    const ask = request.apply_unit as { component_id: string; unit: Unit };
    const { old, manifest, envelope, facts } = cardOf(player, ask.component_id, id);
    const unit = ask.unit;
    const named = (was: object | undefined) => ({
        ...was,
        currency: unit.currency,
        prices: unit.prices,
        base_year: unit.base_year ?? null,
    });

    for (const series of envelope.component.series ?? []) {
        series.unit = named(series.unit);
    }

    return {
        frames: redrawn(old, manifest, {
            id,
            label: `Read the data in ${words}`,
            envelope,
            facts: { ...facts, unit: named(facts.unit as object) },
            offers: offersOf(old, id, { start: unit }),
        }),
        userMessage: `Change ${envelope.component.title.text} to ${words}.`,
        change: { component_id: ask.component_id, kind: 'unit' },
    };
};
