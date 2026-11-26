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
import { editedCard } from './cardChange.ts';
import { messageTurns } from './activityView.ts';
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
import type { PlanLink } from './planLink';
import { isPrompt } from './transcript.ts';

/** One row of `What it measures`. `key` is stable across cards, so a
 *  `Change` attaches to it: `years`, `unit`, `shows`, `within`, `indicators`,
 *  `data_through`, `last_refreshed`, `count:<label>` for a dimension the card
 *  counts, `drawn:<property>` for one of several dimensions it lists. A row
 *  whose value is a list of named values carries them as `terms`. */
export type MeasureRow = { key: string; label: string; value: string; terms: PanelTerm[] | null };

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
    measure: { label: string; definition: string } | null;
    codes: DescribedView['codes'];
    measures: MeasureRow[];
    plan: { turn: number; title: string; rows: PlanRow[]; others: string[] } | null;
    keep: string[];
    /** What a legacy card's data leaves out. */
    leftOut: string[];
    sources: PanelSource[];
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

export type CardPageInput = {
    widget: Widget & { turn: number };
    /** The card's title as the canvas shows it, renamed or as drawn. */
    title: string;
    options: PanelOptions;
    messages: readonly ChatMessage[];
    activity?: readonly ActivityEntry[];
    /** The ids this card replaced, newest first. */
    replaced?: readonly string[];
    /** The approved plan the card belongs to, from `planLinks`, with the plan
     *  itself. */
    plan?: { link: PlanLink; approved: ApprovedPlan } | null;
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
    const lists = view.terms.map((list): MeasureRow => ({
        key: list.key === 'within' ? 'within' : drawn.length === 1 ? 'shows' : list.key,
        label: list.label,
        value: list.terms.map((term) => term.name).join(', '),
        terms: list.terms,
    }));
    const byKey = (key: string) => keyed.filter((entry) => entry.key === key);

    return [
        ...byKey('years'),
        ...byKey('unit'),
        ...lists.filter((entry) => entry.key !== 'within'),
        ...keyed.filter((entry) => entry.key.startsWith('count:')),
        ...lists.filter((entry) => entry.key === 'within'),
    ];
};

const legacyMeasures = (view: LegacyView): MeasureRow[] =>
    (view.blocks.find((block) => block.key === 'facts')?.rows ?? []).map((entry) =>
        row(LEGACY_KEYS[entry.label] ?? entry.label.toLowerCase(), entry.label, entry.value),
    );

// The question the card's turn asked, and the words of each change made to
// it since (an edit turn naming a card this one replaced).
const originOf = ({
    widget,
    messages,
    activity = [],
    replaced = [],
    plan,
}: CardPageInput): { origin: CardOrigin | null; changedFor: string[] } => {
    const turns = messageTurns(messages, activity);
    // An edit naming the card itself is running or was refused; one that
    // took effect named a card this one replaced.
    const ids = new Set(replaced);
    const asked = messages.find(
        (message, index) =>
            isPrompt(message) &&
            turns[index] === widget.turn &&
            !(message.role === 'user' && message.edit),
    );
    const changedFor = messages.flatMap((message) => {
        const edited = editedCard(message);

        return edited !== undefined && ids.has(edited) ? [message.text] : [];
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

const planSection = (plan: CardPageInput['plan'], cardId: string): CardPageView['plan'] =>
    plan
        ? {
              turn: plan.link.turn,
              title: plan.link.title,
              rows: approvedView(plan.approved).choices.map((choice) => ({
                  key: `plan:${choice.key}`,
                  label: choice.name,
                  value: choice.value,
              })),
              others: plan.link.cards.filter((id) => id !== cardId),
          }
        : null;

const fromView = (view: PanelView, input: CardPageInput): CardPageView => {
    const { origin, changedFor } = originOf(input);
    const base = {
        title: input.title,
        origin,
        changedFor,
        plan: planSection(input.plan, input.widget.id),
    };

    if (view.kind === 'described') {
        return {
            ...base,
            live: view.live,
            calculation: view.calculation,
            measure: view.measure,
            codes: view.codes,
            measures: describedMeasures(view, input.widget),
            keep: view.keepInMind,
            leftOut: [],
            sources: view.sources,
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
        measures: legacyMeasures(view),
        keep: view.blocks.find((block) => block.key === 'facts')?.items ?? [],
        leftOut: view.blocks.find((block) => block.key === 'left_out')?.items ?? [],
        sources: view.sources,
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

/** The card standing in `id`'s place now: `id` while it is among `ids`, else
 *  the card that replaced it, followed through every later replacement.
 *  `replacedIds` maps each replacement's id to the id it replaced. Null when
 *  the card left with no replacement. */
export const currentCardId = (
    id: string,
    ids: ReadonlySet<string>,
    replacedIds: Readonly<Record<string, string>>,
): string | null => {
    const seen = new Set<string>();
    let current = id;

    while (!ids.has(current)) {
        seen.add(current);
        const next = Object.keys(replacedIds).find(
            (newer) => replacedIds[newer] === current && !seen.has(newer),
        );

        if (!next) {
            return null;
        }

        current = next;
    }

    return current;
};

/** The ids `id` replaced, newest first. */
export const replacedChain = (
    id: string,
    replacedIds: Readonly<Record<string, string>>,
): string[] => {
    const chain: string[] = [];
    let older = replacedIds[id];

    while (older !== undefined && older !== id && !chain.includes(older)) {
        chain.push(older);
        older = replacedIds[older];
    }

    return chain;
};
