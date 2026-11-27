/**
 * The card page of the Prompt layout's session panel, section by section in
 * the order the page draws them: the head (title and where the card came
 * from), `What it measures`, `Set by the plan`, `Keep in mind`, the sources,
 * `Cite as`, and how the card was made. Every fact comes from the More Info
 * panel's view (`panelViewOf`): the described view, or the legacy view for a
 * card with no readable description.
 */

import type { ChatMessage } from '@/components/organisms/Studio/hooks/useChat';
import type { Widget } from '@/lib/chat/widgets';

import type { ActivityEntry } from './activity';
import { type ChangeOffer, editedCard, offerText } from './cardChange.ts';
import type { CardHistory } from './cardReplace';
import { messageTurns } from './activityView.ts';
import { capitalise } from '../capitalise.ts';
import type { About } from './description';
import type {
    DescribedView,
    LegacyView,
    PanelCalculation,
    PanelIndicator,
    PanelLinkOffer,
    PanelMade,
    PanelOptions,
    PanelSource,
    PanelTerm,
    PanelView,
} from './descriptionBlocks';
import { cardDescription, panelViewOf } from './infoPanel.ts';
import { approvedView, type ApprovedPlan } from './plan.ts';
import type { CardPlan } from './planLink';
import type { DecisionKind } from './wire';
import { cardSources, sourceMeta, throughOf } from './sessionView.ts';
import { isPrompt } from './transcript.ts';

/** One row of `What it measures`. `key` is stable across cards, so a
 *  `Change` attaches to it: `years`, `unit`, `shows`, `within`, `indicators`,
 *  `data_through`, `last_refreshed`, `count:<label>` for a dimension the card
 *  counts, `drawn:<property>` for one of several dimensions it lists, and an
 *  offer's id (`shows:<role>`) for a row only the offer names. A row whose
 *  value is a list of named values carries them as `terms`, and a row the
 *  card can change carries the offer. */
export type MeasureRow = {
    key: string;
    label: string;
    value: string;
    terms: PanelTerm[] | null;
    offer: ChangeOffer | null;
};

/** Where the card came from: the approved plan its question made, else the
 *  question it was made for. Each opens its page. */
export type CardOrigin =
    | { kind: 'plan'; turn: number; title: string }
    | { kind: 'turn'; turn: number; question: string };

/** A plan choice as `Set by the plan` lists it. */
export type PlanRow = { key: string; label: string; value: string };

export type CardPageView = {
    title: string;
    /** "Drawn live from the latest data", for a live card. */
    live: string | null;
    origin: CardOrigin | null;
    /** Each change made to the card since, in the words its turn showed. */
    changedFor: string[];
    calculation: PanelCalculation | null;
    /** The measure in bold, then its definition when the description has one. */
    measure: { label: string; definition: string | null } | null;
    codes: DescribedView['codes'];
    measures: MeasureRow[];
    plan: { turn: number; title: string; rows: PlanRow[]; others: string[] } | null;
    keep: string[];
    /** What a legacy card's data leaves out. */
    leftOut: string[];
    sources: PanelSource[];
    /** Each source as the panel's source row, keyed by the id its source page
     *  opens under (`sourceKey`). */
    sourceRows: CardSourceRow[];
    /** A computed card's inputs, when no calculation names them. */
    inputs: string[];
    /** "Computed by the Development Finance Observatory.", for a computed card. */
    from: string | null;
    /** The citation in each form it has: a legacy card has one. */
    cite: { short: string; full: string | null; offer: PanelLinkOffer | null } | null;
    made: PanelMade | null;
    /** A legacy card's indicators, with their ids and descriptions. */
    indicators: PanelIndicator[];
};

export type CardSourceRow = {
    key: string;
    name: string;
    through: string | null;
    meta: string | null;
};

export type CardPageInput = {
    widget: Widget & { turn: number } & CardHistory;
    /** The card's title as the canvas shows it, renamed or as drawn. */
    title: string;
    options: PanelOptions;
    messages: readonly ChatMessage[];
    activity?: readonly ActivityEntry[];
    /** The approved plan the card belongs to, from `planLinks`, with the plan
     *  itself. */
    plan?: { link: CardPlan; approved: ApprovedPlan } | null;
    /** The changes the card offers (`changeOffers`). */
    offers?: readonly ChangeOffer[];
};

// The legacy facts block's labels, as `legacyPanel` writes them.
const LEGACY_KEYS: Record<string, string> = {
    Years: 'years',
    Indicators: 'indicators',
    Unit: 'unit',
    'Data through': 'data_through',
    'Last refreshed': 'last_refreshed',
};

const row = (key: string, label: string, value: string): MeasureRow => ({
    key,
    label,
    value,
    terms: null,
    offer: null,
});

// `aboutRows` writes a count per listed dimension, then the period (labelled
// `Years` or `Period`) when the description has one, then the unit when it
// has one. The description says which of the last two are there, so the rows
// are keyed by place.
const describedMeasures = (view: DescribedView, widget: Widget): MeasureRow[] => {
    const about = widget.info ? cardDescription(widget.info)?.about : undefined;
    const hasUnit = !!about?.unit;
    const hasPeriod = !!(about?.drawn?.period ?? about?.period);
    const counts = view.rows.length - Number(hasUnit) - Number(hasPeriod);
    const keyed = view.rows.map((entry, index) => {
        if (index < counts) {
            return row(`count:${entry.label}`, entry.label, entry.value);
        }

        const isUnit = hasUnit && index === view.rows.length - 1;

        return row(isUnit ? 'unit' : 'years', entry.label, entry.value);
    });
    const drawn = view.terms.filter((list) => list.key !== 'within');
    const lists = drawn.map((list): MeasureRow => ({
        key: list.key === 'within' ? 'within' : drawn.length === 1 ? 'shows' : list.key,
        label: list.label,
        value: list.terms.map((term) => term.name).join(', '),
        terms: list.terms,
        offer: null,
    }));
    const byKey = (key: string) => keyed.filter((entry) => entry.key === key);

    return [
        ...byKey('years'),
        ...byKey('unit'),
        ...lists.filter((entry) => entry.key !== 'within'),
        ...keyed.filter((entry) => entry.key.startsWith('count:')),
        ...withinRow(about),
    ];
};

// A property label the service leaves as its key (`observationAbout`) has no
// words to show, so only the value is shown for it.
const isRawKey = (label: string): boolean => /^[a-z]+(?:[A-Z][a-z0-9]*)+$/.test(label);

// Every value the card is fixed to, such as its recipient, as
// `property: value` joined with semicolons.
const withinRow = (about: About | undefined): MeasureRow[] => {
    const fixed = about?.fixed ?? [];

    return fixed.length > 0
        ? [
              row(
                  'within',
                  'Within',
                  fixed
                      .map(({ property, value }) =>
                          isRawKey(property.label)
                              ? value.label
                              : `${property.label}: ${value.label}`,
                      )
                      .join('; '),
              ),
          ]
        : [];
};

// The measure's name, with its definition when the description has one.
const measureOf = (view: DescribedView, widget: Widget): CardPageView['measure'] => {
    const label = widget.info ? cardDescription(widget.info)?.about.measure?.label : undefined;

    return view.measure ?? (label ? { label: capitalise(label), definition: null } : null);
};

const legacyMeasures = (view: LegacyView): MeasureRow[] =>
    (view.blocks.find((block) => block.key === 'facts')?.rows ?? []).map((entry) =>
        row(LEGACY_KEYS[entry.label] ?? entry.label.toLowerCase(), entry.label, entry.value),
    );

// The question the card's turn asked, and the words of each card change
// that drew a card of its chain (`changedIn`, which placeCard records only
// when the change drew a card), oldest first. A change the harness refused,
// or one still running, drew none.
const originOf = ({
    widget,
    messages,
    activity = [],
    plan,
}: CardPageInput): { origin: CardOrigin | null; changedFor: string[] } => {
    const turns = messageTurns(messages, activity);
    const asked = messages.find(
        (message, index) =>
            isPrompt(message) &&
            turns[index] === widget.turn &&
            !(message.role === 'user' && message.edit),
    );
    const changedFor = (widget.changedIn ?? []).flatMap((turn) => {
        const prompt = messages.find(
            (message) =>
                message.role === 'user' &&
                message.turn === turn &&
                editedCard(message) !== undefined,
        );

        return prompt ? [prompt.text] : [];
    });

    if (plan) {
        return {
            origin: { kind: 'plan', turn: plan.link.turn, title: plan.link.title },
            changedFor,
        };
    }

    return {
        origin: asked ? { kind: 'turn', turn: widget.turn, question: asked.text } : null,
        changedFor,
    };
};

// A term's ref, from its key (`<ref>#<index>`, termOf), without the graph's
// `dcid:` prefix that a place offer's ids leave off.
const termRef = (key: string): string => key.replace(/#\d+$/, '').replace(/^dcid:/, '');

// Whether a listed row names exactly the places an offer shows now.
const listsChosen = (row: MeasureRow, offer: ChangeOffer): boolean => {
    if (offer.key !== 'shows' || !row.terms) return false;

    const refs = new Set(row.terms.map((term) => termRef(term.key)));

    return refs.size === offer.chosen.length && offer.chosen.every((place) => refs.has(place.id));
};

/**
 * The measure rows with each offer on the row it changes: a unit or years
 * offer on the row of that key, a places offer on the listed row that names
 * exactly its chosen places (taking the offer's label). An offer whose row
 * the card's facts do not show gets a row of its own, in the offer's words.
 */
export const rowsWithOffers = (
    rows: readonly MeasureRow[],
    offers: readonly ChangeOffer[],
): MeasureRow[] => {
    const placed = new Set<string>();
    const withOffer = rows.map((row): MeasureRow => {
        const offer = offers.find(
            (other) =>
                !placed.has(other.id) &&
                (other.key === 'shows' ? listsChosen(row, other) : other.key === row.key),
        );

        if (!offer) return row;

        placed.add(offer.id);

        if (offer.key === 'shows') return { ...row, key: offer.id, label: offer.label, offer };

        return offer.key === 'years' && offer.window?.single
            ? { ...row, label: 'Year', offer }
            : { ...row, offer };
    });
    const missing = offers
        .filter((offer) => !placed.has(offer.id))
        .map((offer): MeasureRow => ({
            key: offer.id,
            label:
                offer.key === 'shows'
                    ? offer.label
                    : offer.key === 'unit'
                      ? 'Unit'
                      : offer.window?.single
                        ? 'Year'
                        : 'Years',
            value: offerText(offer),
            terms: null,
            offer,
        }));

    const all = [...withOffer, ...missing];

    // A places row labelled `Shows` beside a listed row of that label (the
    // sectors a card draws, say) reads `Places` instead.
    return all.map((row) =>
        row.offer?.key === 'shows' &&
        all.some((other) => other !== row && other.label === row.label)
            ? { ...row, label: row.offer.multiple ? 'Places' : 'Place' }
            : row,
    );
};

// The kind of plan choice a row of the card shows the value of: `unit` for
// its unit, `window` for its years, `places` for the places a places offer
// changes. A listed row without that offer may list anything (sectors, say),
// so it matches no kind.
const rowKind = (entry: MeasureRow): DecisionKind | null => {
    if (entry.offer?.key === 'shows') return 'places';
    if (entry.key === 'unit') return 'unit';

    return entry.key === 'years' ? 'window' : null;
};

/**
 * `Set by the plan`: the approved plan's choices that shape the card's own
 * step (a choice's `step_ids` include it), less a choice the page shows
 * already, matched on the choice's `kind`: a row's kind (`rowKind`), and
 * `count`, how the flows are counted, while the page shows the measure line.
 * A card linked to its plan by turn, or a plan whose choices name no steps,
 * lists every choice.
 */
const planSection = (
    plan: CardPageInput['plan'],
    cardId: string,
    rows: readonly MeasureRow[],
    measureShown: boolean,
): CardPageView['plan'] => {
    if (!plan) return null;

    const stepId = plan.link.stepId;
    const kinds = new Set<DecisionKind | null>([
        ...rows.map(rowKind),
        ...(measureShown ? ['count' as const] : []),
    ]);
    const choices = plan.approved.choices ?? [];

    return {
        turn: plan.link.turn,
        title: plan.link.title,
        rows: approvedView(plan.approved).choices.flatMap((view, index) => {
            const choice = choices[index];
            const offStep = !!stepId && !!choice?.step_ids && !choice.step_ids.includes(stepId);
            const shown = !!choice?.kind && kinds.has(choice.kind);

            return offStep || shown
                ? []
                : [{ key: `plan:${view.key}`, label: view.name, value: view.value }];
        }),
        others: plan.link.cards.filter((id) => id !== cardId),
    };
};

// The card's sources as the session's source rows read them (`cardSources`),
// with the line under each name built by the same rule (`sourceMeta`).
const sourceRowsOf = (widget: CardPageInput['widget']): CardSourceRow[] => {
    const { info } = widget;

    if (!info) return [];

    const through = throughOf(info, widget);

    return cardSources(info).map((source) => ({
        key: source.key,
        name: source.name,
        through,
        meta: sourceMeta({ ...source, through }),
    }));
};

const fromView = (view: PanelView, input: CardPageInput): CardPageView => {
    const { origin, changedFor } = originOf(input);
    const measures = rowsWithOffers(
        view.kind === 'described' ? describedMeasures(view, input.widget) : legacyMeasures(view),
        input.offers ?? [],
    );
    const measure = view.kind === 'described' ? measureOf(view, input.widget) : null;
    const base = {
        title: input.title,
        origin,
        changedFor,
        measures,
        plan: planSection(input.plan, input.widget.id, measures, measure !== null),
    };

    if (view.kind === 'described') {
        return {
            ...base,
            live: view.live,
            calculation: view.calculation,
            measure,
            codes: view.codes,
            keep: view.keepInMind,
            leftOut: [],
            sources: view.sources,
            sourceRows: sourceRowsOf(input.widget),
            inputs: view.inputs,
            from: view.from,
            cite: view.cite,
            made: view.made,
            indicators: [],
        };
    }

    return {
        ...base,
        live: null,
        calculation: null,
        measure: null,
        codes: null,
        keep: view.blocks.find((block) => block.key === 'facts')?.items ?? [],
        leftOut: view.blocks.find((block) => block.key === 'left_out')?.items ?? [],
        sources: view.sources,
        sourceRows: sourceRowsOf(input.widget),
        inputs: [],
        from: null,
        cite: view.citation ? { short: view.citation, full: null, offer: null } : null,
        made: null,
        indicators: view.indicators,
    };
};

/** The card page's view of `input.widget`, or null for a card with no facts
 *  to show (a text card). */
export const cardPageView = (input: CardPageInput): CardPageView | null => {
    const { info } = input.widget;

    return info ? fromView(panelViewOf(info, input.options), input) : null;
};
