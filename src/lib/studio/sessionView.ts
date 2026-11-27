/**
 * The session panel's view model: the overview (one group per question,
 * removed cards, `Keep in mind` and sources) and the question, `Data used`,
 * plan and source pages, built from the chat state and the canvas. Pure, so
 * the rules run under `node --test`.
 */

import type { ChatMessage, TurnWidget } from '@/components/organisms/Studio/hooks/useChat';

import type { CardInfo, Widget } from '../chat/widgets.ts';
import type { CardHistory } from './cardReplace';
import type { ActivityEntry, ActivityTool } from './activity';
import { standingFor } from './cardIdentity.ts';
import { producedTurns } from './planLink.ts';
import type { Clarify } from './clarify';
import { type PanelSource, sourceEntries } from './descriptionBlocks.ts';
import { cardDescription, legacySources } from './infoPanel.ts';
import { plainTextFromNote } from './note.ts';
import { firstSentence, promptsOf } from './questions.ts';
import {
    type ApprovedPlan,
    approvedView,
    planView,
    type PlanState,
    type PlanView,
} from './plan.ts';

/** Question groups shown before the `earlier` fold. */
export const GROUPS_SHOWN = 3;

/** `Keep in mind` starts open with this many caveats or fewer. */
export const KEEP_OPEN_UP_TO = 2;

export type StageId = 'ask' | 'find' | 'fetch' | 'calc' | 'make' | 'plan';
export type RowState = 'done' | 'running' | 'waiting' | 'pending' | 'skipped' | 'failed';

const TOOL_STAGE: Record<string, StageId> = {
    search: 'find',
    sources: 'find',
    recall: 'find',
    resolve_definition: 'find',
    fetch: 'fetch',
    get_data: 'fetch',
    aggregate: 'calc',
    growth: 'calc',
    rank: 'calc',
    compare: 'calc',
    share_of: 'calc',
    quotient_of: 'calc',
    sum_of: 'calc',
    join: 'calc',
    filter: 'calc',
    make_charts: 'make',
    write_component: 'make',
    remove_cards: 'make',
    plan: 'plan',
    propose_plan: 'plan',
};

// [done, running] words for each stage.
const STAGE_WORDS: Record<StageId, [string, string]> = {
    ask: ['Asked you', 'Asking you'],
    find: ['Found the data', 'Finding the data'],
    fetch: ['Fetched the data', 'Fetching the data'],
    calc: ['Calculated', 'Calculating'],
    make: ['Made the cards', 'Making the cards'],
    plan: ['Research plan', 'Working on a plan'],
};

export type CardGlyph = 'key-number' | 'note' | 'chart-table' | 'chart-line' | 'chart-bar';
export type CardViewName = 'chart-bar' | 'chart-line' | 'chart-table';

/** A card row: its glyph and kind tag, its title, and what a change to it
 *  (a silent edit turn) is doing. */
export type CardRow = {
    id: string;
    title: string;
    glyph: CardGlyph;
    tag: string;
    text: boolean;
    /** The card's data can be downloaded (it names its stored component). */
    data: boolean;
    change: { state: 'running' } | { state: 'refused'; text: string } | null;
};

export type StageRow = { id: StageId; state: RowState; label: string; note: string | null };

export type PlanLine = {
    turn: number;
    steps: number;
    /** The state after the count, empty when the plan is done in full. */
    state: string;
    live: boolean;
};

export type Group = {
    turn: number;
    question: string;
    newest: boolean;
    /** The state words (`Working`, `2 cards`, …). */
    words: string;
    /** A group that made, changed and removed nothing, has no plan and has
     *  a reply: it shows its words as one line that opens its page. */
    quiet: boolean;
    /** The newest group's progress, while it has no reply or a stage failed. */
    stages: StageRow[];
    plan: PlanLine | null;
    cards: CardRow[];
    /** The cards this question changed that an earlier one made. */
    changed: ChangedLine[];
    /** `1 card removed`, `2 cards removed`: a group whose cards have all
     *  left the canvas says so in one quiet line. Empty otherwise. */
    gone: string;
};

/** `Changed <title>`: a card a question replaced, by the card standing now. */
export type ChangedLine = { id: string; title: string; onCanvas: boolean };

export type Keep = { text: string; cards: { id: string; title: string }[] };

export type SourceRow = {
    key: string;
    name: string;
    /** The source's page on this site (its dcid), for a described card. */
    page: string | null;
    /** The source's outside page, for a card without a description. */
    url: string | null;
    licence: string | null;
    through: string | null;
    /** The line under the row's name (`sourceMeta`). */
    meta: string | null;
    lastRefreshed: string | null;
    citations: string[];
    cards: { id: string; title: string }[];
};

export type Overview = {
    /** No question yet: the panel draws nothing. */
    empty: boolean;
    cardCount: number;
    groups: Group[];
    /** The groups behind the `earlier` fold (the oldest ones), and the canvas
     *  cards they made. */
    earlier: { questions: number; cards: number } | null;
    removed: CardRow[];
    keep: Keep[];
    sources: SourceRow[];
    citations: string[];
};

export type SessionInput = {
    messages: readonly ChatMessage[];
    widgets: readonly TurnWidget[];
    activity: readonly ActivityEntry[];
    /** The plan waiting on the reader, while one is. */
    plan: PlanState | null;
    clarify: Clarify | null;
    thinking: boolean;
    /** The cards on the canvas, in canvas order. */
    canvasIds: readonly string[];
    titleOf: (id: string) => string;
    /** Each card's chosen view, by id. */
    views?: Readonly<Record<string, CardViewName>>;
    /** Cards that took another's slot this session, new id to old id. */
    replaced?: Readonly<Record<string, string>>;
};

// ---- turns ------------------------------------------------------------------

/** One question as the panel reads it from the transcript. */
type Turn = {
    turn: number;
    question: string;
    /** A silent card change: the component id it was asked of. */
    edit: { target: string } | null;
    reply: string;
    plan: PlanView | null;
    /** The approved plan behind `plan`, whose steps carry their ids. */
    approved: ApprovedPlan | null;
    planLive: boolean;
    entry: ActivityEntry | null;
    last: boolean;
};

/** The transcript's questions, oldest first (promptsOf) without refused
 *  prompts, with what the panel adds: the plan's view and the turn's
 *  Activity entry. */
const turnsOf = (input: SessionInput): Turn[] => {
    const { messages, activity } = input;
    // A refused prompt ran no turn, so the panel shows no group for it.
    const asked = promptsOf(messages, activity).filter((question) => !question.refused);
    const turns: Turn[] = asked.map((question) => ({
        turn: question.turn,
        question: question.text,
        edit: question.edit ? { target: question.edit.card } : null,
        reply: question.reply,
        plan: question.plan ? approvedView(question.plan) : null,
        approved: question.plan,
        planLive: false,
        entry: null,
        last: false,
    }));

    const last = turns.at(-1);

    if (last) {
        last.last = true;

        if (input.plan?.live && !last.plan) {
            last.plan = planView(input.plan);
            last.planLive = true;
        }
    }

    for (const turn of turns) {
        turn.entry = activity.findLast((entry) => entry.turn === turn.turn) ?? null;
    }

    return turns;
};

const running = (turn: Turn, input: SessionInput) => turn.last && input.thinking;

const waiting = (turn: Turn, input: SessionInput) =>
    turn.last && (input.clarify !== null || turn.planLive);

const failed = (turn: Turn) => turn.entry?.failed === true;

// A failed turn's reply text says why it failed, which is no answer.
const hasReply = (turn: Turn, input: SessionInput) =>
    !running(turn, input) && !waiting(turn, input) && !failed(turn) && turn.reply.trim() !== '';

// ---- stages -----------------------------------------------------------------

const stageOf = (tool: ActivityTool): StageId | null =>
    typeof tool.args === 'string' ? (TOOL_STAGE[tool.args] ?? null) : null;

// Drops each failed step that a later step of the same tool finished.
const withoutFixed = (tools: ActivityTool[]): ActivityTool[] =>
    tools.filter(
        (tool, index) =>
            tool.state !== 'failed' ||
            !tools
                .slice(index + 1)
                .some((later) => later.args === tool.args && later.state === 'complete'),
    );

const stageRow = (id: StageId, tools: ActivityTool[], failure: string | null = null): StageRow => {
    const kept = withoutFixed(tools);
    const live = kept.findLast((tool) => tool.state === 'running' || tool.state === 'pending');
    const broke = kept.findLast((tool) => tool.state === 'failed');
    const state: RowState = live ? 'running' : broke ? 'failed' : 'done';
    const [done, doing] = STAGE_WORDS[id];

    return {
        id,
        state,
        label: state === 'done' ? done : doing,
        note: live ? live.name : broke ? broke.summary?.trim() || failure : null,
    };
};

/**
 * A turn's progress rows: `ask` while a question waits (or once one was
 * answered), then a row per stage its steps reached. A step whose tool names
 * no stage takes the stage of the step before it. The planner's row shows
 * only while it runs and no plan has arrived. A failed row's note is its
 * last failed step's detail, else `failure` (why the turn failed).
 */
export const stagesOf = (
    tools: readonly ActivityTool[],
    {
        asking,
        asked,
        planned,
        failure = null,
    }: { asking: boolean; asked: boolean; planned: boolean; failure?: string | null },
): StageRow[] => {
    const groups = new Map<StageId, ActivityTool[]>();
    let before: StageId = 'find';

    for (const tool of tools) {
        const stage: StageId = stageOf(tool) ?? before;

        before = stage;
        groups.set(stage, [...(groups.get(stage) ?? []), tool]);
    }

    const rows: StageRow[] = [];

    if (asking || asked) {
        rows.push({
            id: 'ask',
            state: asking ? 'waiting' : 'done',
            label: asking ? STAGE_WORDS.ask[1] : STAGE_WORDS.ask[0],
            note: asking ? 'At the prompt' : null,
        });
    }

    for (const id of ['find', 'fetch', 'calc', 'make'] as const) {
        const group = groups.get(id);

        if (group) rows.push(stageRow(id, group, failure));
    }

    const planning = groups.get('plan');

    if (planning && !planned) {
        const row = stageRow('plan', planning);

        if (row.state === 'running') rows.push(row);
    }

    return rows;
};

// ---- cards ------------------------------------------------------------------

const glyphOf = (widget: Widget, view?: CardViewName): { glyph: CardGlyph; tag: string } => {
    if (widget.kind === 'key_number') return { glyph: 'key-number', tag: 'Key number' };
    if (widget.kind === 'text') return { glyph: 'note', tag: 'Text' };

    const shown =
        view ??
        (widget.kind === 'table'
            ? 'chart-table'
            : widget.chartType === 'line'
              ? 'chart-line'
              : 'chart-bar');

    if (shown === 'chart-table') return { glyph: 'chart-table', tag: 'Table' };
    if (shown === 'chart-line') return { glyph: 'chart-line', tag: 'Line chart' };

    return {
        glyph: 'chart-bar',
        tag: widget.kind === 'chart' && widget.horizontal ? 'Ranking' : 'Bar chart',
    };
};

const plural = (count: number, one: string, many = `${one}s`) =>
    `${count} ${count === 1 ? one : many}`;

// ---- the overview -----------------------------------------------------------

const wordsOf = (turn: Turn, made: number, input: SessionInput): string => {
    if (!hasReply(turn, input)) {
        if (failed(turn)) return 'No answer';
        if (waiting(turn, input)) return 'Waiting for you';

        return running(turn, input) ? 'Working' : 'No answer';
    }

    return made > 0 ? plural(made, 'card') : 'Answered in words';
};

const planLineOf = (turn: Turn, input: SessionInput): PlanLine | null => {
    if (!turn.plan) return null;

    const steps = turn.plan.steps.length;
    let state = '';

    if (turn.planLive) {
        state = 'Waiting for you at the prompt';
    } else if (running(turn, input)) {
        state = 'Working';
    } else if (failed(turn)) {
        state = 'Stopped';
    }

    return { turn: turn.turn, steps, state, live: turn.planLive };
};

/**
 * The rows of the cards each question made, keyed by turn, in canvas order,
 * and the rows of the cards off the canvas. A card stays with the question
 * that made the first card of its chain of replacements (`madeIn`), and the
 * question that drew it in another's place shows a `Changed` line for it.
 * A unit change keeps the card's turn (placeCard's `keepTurn`), so it shows
 * none.
 */
const cardRows = (input: SessionInput, turns: Turn[]) => {
    const byId = new Map(input.widgets.map((widget) => [widget.id, widget]));
    const order = new Map(input.canvasIds.map((id, at) => [id, at]));
    const changes = new Map<string, CardRow['change']>();

    // The latest change asked of each card, on the card standing for it now:
    // running while its turn runs, refused when its turn failed. A change
    // that went through replaced the card, and the card it left clears.
    for (const turn of turns) {
        const target = turn.edit && standingFor(turn.edit.target, order, input.replaced ?? {});

        if (!target) continue;

        if (running(turn, input)) {
            changes.set(target, { state: 'running' });
        } else if (failed(turn)) {
            changes.set(target, {
                state: 'refused',
                text: plainTextFromNote(turn.reply.trim()) || 'The change did not go through.',
            });
        } else {
            changes.delete(target);
        }
    }

    const rowOf = (widget: TurnWidget): CardRow => ({
        id: widget.id,
        title: input.titleOf(widget.id),
        ...glyphOf(widget, input.views?.[widget.id]),
        text: widget.kind === 'text',
        data: widget.kind !== 'text' && widget.ref !== undefined,
        change: changes.get(widget.id) ?? null,
    });

    const rootOf = (widget: TurnWidget) => widget.madeIn ?? widget.turn;
    const onCanvas = input.canvasIds.flatMap((id) => {
        const widget = byId.get(id);

        return widget ? [widget] : [];
    });
    const byTurn = new Map<number, CardRow[]>();
    const changedBy = new Map<number, ChangedLine[]>();

    for (const widget of onCanvas.toSorted(
        (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
    )) {
        const root = rootOf(widget);

        byTurn.set(root, [...(byTurn.get(root) ?? []), rowOf(widget)]);
    }

    for (const widget of input.widgets) {
        if (widget.turn === rootOf(widget)) continue;

        changedBy.set(widget.turn, [
            ...(changedBy.get(widget.turn) ?? []),
            { id: widget.id, title: input.titleOf(widget.id), onCanvas: order.has(widget.id) },
        ]);
    }

    const removed = input.widgets.filter((widget) => !order.has(widget.id)).map(rowOf);
    const madeBy = (turn: number) =>
        input.widgets.filter((widget) => rootOf(widget) === turn).length;
    const removedBy = (turn: number) =>
        input.widgets.filter((widget) => rootOf(widget) === turn && !order.has(widget.id)).length;

    return {
        byTurn,
        removed,
        made: (turn: number) => byTurn.get(turn)?.length ?? 0,
        madeBy,
        removedBy,
        changed: (turn: number) => changedBy.get(turn) ?? [],
    };
};

/** How far a card's data runs, as a source row's meta line: `data through
 *  <year>`, with projections when a served year is projected. The
 *  freshness's `data_through` is the last year the card was served, so a
 *  card drawn to end before its data does (its window's `end_year` before
 *  `last_year`, the last year its data holds) reads `last_year`. A card
 *  changed by a card change with no window to read shows no year, since its
 *  served year may stop short of its data. */
export const throughOf = (info: CardInfo, card?: Widget & CardHistory): string | null => {
    const window = card && card.kind !== 'text' ? card.cardChanges?.window : undefined;
    const served = info.dataThrough?.match(/\d{4}/)?.[0];
    const year = window
        ? window.end_year < window.last_year
            ? String(window.last_year)
            : served
        : card?.changedIn?.length
          ? undefined
          : served;

    if (!year) return null;

    const projected = (info.held ?? []).some(
        (entry) => entry.served && entry.status === 'projected',
    );

    return projected ? `data through ${year}, with projections` : `data through ${year}`;
};

const citationOf = (info: CardInfo): string | null =>
    cardDescription(info)?.cite.text ?? info.citation ?? null;

/** The id a source page opens under: a described source's documentation
 *  page, else a legacy source's id (`lookup`), else its name. */
export const sourceKey = (entry: Pick<PanelSource, 'name' | 'page' | 'lookup'>): string =>
    entry.page ?? entry.lookup ?? entry.name;

/** One source a card credits, as the panel's source rows read it. */
export type CardSourceEntry = Pick<SourceRow, 'key' | 'name' | 'page' | 'url' | 'licence'>;

/** The sources `info` credits: a described card's credited sources, named
 *  publisher first (`sourceEntries`), else its legacy sources. */
export const cardSources = (info: CardInfo): CardSourceEntry[] => {
    const description = cardDescription(info);

    if (!description) {
        return legacySources(info).map((source) => ({
            key: sourceKey({ page: null, lookup: source.id, name: source.name }),
            name: source.name,
            page: null,
            url: source.url,
            licence: source.licence,
        }));
    }

    return sourceEntries(description).map((entry) => ({
        key: sourceKey(entry),
        name: entry.name,
        page: entry.page,
        url: entry.url,
        licence: entry.meta,
    }));
};

/** The line under a source row's name: how far the data runs and the
 *  licence, joined with ` · `, each left out when unknown. The publisher
 *  leads the name already (`publisherFirst`). */
export const sourceMeta = ({
    through,
    licence,
}: Pick<SourceRow, 'through' | 'licence'>): string | null => {
    const parts = [through, licence].filter((part) => !!part);

    return parts.length > 0 ? parts.join(' · ') : null;
};

/** The sources of the cards on the canvas, each once, in the order the
 *  canvas first uses them. */
const sourcesOf = (input: SessionInput): SourceRow[] => {
    const byId = new Map(input.widgets.map((widget) => [widget.id, widget]));
    const rows = new Map<string, SourceRow>();

    for (const id of input.canvasIds) {
        const widget = byId.get(id);
        const info = widget?.info;

        if (!widget || !info) continue;

        const found = cardSources(info);

        for (const source of found) {
            const { key } = source;
            const row = rows.get(key) ?? {
                key,
                name: source.name,
                page: source.page,
                url: source.url,
                licence: source.licence,
                through: null,
                meta: null,
                lastRefreshed: null,
                citations: [],
                cards: [],
            };
            const citation = citationOf(info);

            row.through ??= throughOf(info, widget);
            row.lastRefreshed ??= info.lastRefreshed;

            if (citation && !row.citations.includes(citation)) row.citations.push(citation);
            if (!row.cards.some((card) => card.id === id)) {
                row.cards.push({ id, title: input.titleOf(id) });
            }

            rows.set(key, row);
        }
    }

    return [...rows.values()].map((row) => ({ ...row, meta: sourceMeta(row) }));
};

/** The distinct caveats of the cards on the canvas, then of each approved
 *  plan, in first-seen order. A plan's caveat names that plan's cards. */
const keepOf = (input: SessionInput, turns: Turn[], byTurn: Map<number, CardRow[]>): Keep[] => {
    const byId = new Map(input.widgets.map((widget) => [widget.id, widget]));
    const keeps = new Map<string, Keep>();
    const add = (text: string, ids: string[]) => {
        const keep = keeps.get(text) ?? { text, cards: [] };

        for (const id of ids) {
            if (!keep.cards.some((card) => card.id === id)) {
                keep.cards.push({ id, title: input.titleOf(id) });
            }
        }

        keeps.set(text, keep);
    };

    for (const id of input.canvasIds) {
        const info = byId.get(id)?.info;
        const description = info && cardDescription(info);

        for (const caveat of description?.caveats ?? []) add(caveat.text, [id]);
    }

    for (const turn of turns) {
        if (!turn.plan || turn.planLive) continue;

        const ids = (byTurn.get(turn.turn) ?? []).map((row) => row.id);

        for (const caveat of turn.plan.caveats) add(caveat, ids);
    }

    return [...keeps.values()];
};

/** The panel's overview. */
export const overviewOf = (input: SessionInput): Overview => {
    const turns = turnsOf(input);
    const groupsTurns = turns.filter((turn) => !turn.edit);
    const { byTurn, removed, made, madeBy, removedBy, changed } = cardRows(input, turns);
    const newest = groupsTurns.at(-1);
    const groups = groupsTurns.map((turn): Group => {
        const cards = byTurn.get(turn.turn) ?? [];
        const lines = changed(turn.turn);
        const count = madeBy(turn.turn) + lines.length;
        const isNewest = turn === newest;
        const plan = planLineOf(turn, input);
        const replied = hasReply(turn, input);
        const quiet = replied && count === 0 && !plan;
        const showStages = isNewest && (!replied || failed(turn));

        return {
            turn: turn.turn,
            question: turn.question,
            newest: isNewest,
            words: wordsOf(turn, count, input),
            quiet,
            stages: showStages
                ? stagesOf(turn.entry?.tools ?? [], {
                      asking: turn.last && input.clarify !== null,
                      asked: false,
                      planned: turn.plan !== null,
                      failure: failed(turn) ? firstSentence(turn.reply) || null : null,
                  })
                : [],
            plan,
            cards,
            changed: lines,
            gone:
                cards.length === 0 && removedBy(turn.turn) > 0
                    ? `${plural(removedBy(turn.turn), 'card')} removed`
                    : '',
        };
    });
    const hidden = Math.max(0, groups.length - GROUPS_SHOWN);
    const sources = sourcesOf(input);

    return {
        empty: turns.length === 0,
        cardCount: input.canvasIds.length,
        groups,
        earlier:
            hidden > 0
                ? {
                      questions: hidden,
                      cards: groups
                          .slice(0, hidden)
                          .reduce((sum, group) => sum + made(group.turn), 0),
                  }
                : null,
        removed,
        keep: keepOf(input, turns, byTurn),
        sources,
        citations: [...new Set(sources.flatMap((source) => source.citations))],
    };
};

/** The `earlier` fold's words while shut. */
export const earlierWords = ({ questions, cards }: { questions: number; cards: number }) =>
    `${plural(questions, 'earlier question')}${cards > 0 ? `, ${plural(cards, 'card')}` : ''}`;

// ---- pages ------------------------------------------------------------------

export type Dataset = { measure: string; source: string | null; years: string | null };

export type TurnPage = {
    turn: number;
    question: string;
    words: string;
    reply: string;
    datasets: number;
    plan: PlanLine | null;
    cards: CardRow[];
    changed: ChangedLine[];
};

/** "OECD Creditor Reporting System (CRS)" reads "OECD CRS" when the
 *  bracketed acronym spells the initials of the words before it. */
export const shortName = (name: string): string => {
    const match = name.match(/^(.*?)\s*\(([A-Z]{2,})\)$/);

    if (!match) return name;

    const [, long = '', acronym = ''] = match;
    const words = long.split(/\s+/);
    const tail = words.slice(-acronym.length);
    const initials = tail
        .map((word) => word[0] ?? '')
        .join('')
        .toUpperCase();

    if (tail.length !== acronym.length || initials !== acronym) return name;

    return [...words.slice(0, -acronym.length), acronym].join(' ');
};

const yearsOf = (info: CardInfo): string | null => {
    if (!info.years) return null;

    const { start, end } = info.years;

    return start === end ? start : `${start} to ${end}`;
};

/**
 * The datasets a question's cards drew, one per measure, source and years:
 * each card's measure (its title when it names none), its first credited
 * source and its years. A question that made no card lists the data its
 * completed fetch steps named.
 */
export const datasetsOf = (input: SessionInput, turn: number): Dataset[] => {
    const found = new Map<string, Dataset>();
    const add = (dataset: Dataset) => {
        const key = JSON.stringify([dataset.measure, dataset.source, dataset.years]);

        if (!found.has(key)) found.set(key, dataset);
    };

    const produced = producedTurns(input.activity);

    for (const widget of input.widgets) {
        if ((produced.get(widget.id) ?? widget.turn) !== turn || !widget.info) continue;

        const { info } = widget;
        const description = cardDescription(info);
        const measure =
            description?.about.measure?.label ??
            info.indicators?.[0]?.name ??
            input.titleOf(widget.id);
        const source = description
            ? (sourceEntries(description)[0]?.name ?? null)
            : (info.sources?.[0]?.name ?? info.sourceName);

        add({ measure, source: source && shortName(source), years: yearsOf(info) });
    }

    if (found.size > 0) return [...found.values()];

    const entry = input.activity.findLast((each) => each.turn === turn);

    for (const tool of entry?.tools ?? []) {
        if (stageOf(tool) === 'fetch' && tool.state === 'complete') {
            add({ measure: tool.name, source: null, years: null });
        }
    }

    return [...found.values()];
};

export const turnPageOf = (input: SessionInput, turn: number): TurnPage | null => {
    const turns = turnsOf(input);
    const found = turns.find((each) => each.turn === turn && !each.edit);

    if (!found) return null;

    const { byTurn, madeBy, changed } = cardRows(input, turns);
    const count = madeBy(turn) + changed(turn).length;

    return {
        turn,
        question: found.question,
        words: wordsOf(found, count, input),
        reply: hasReply(found, input) ? firstSentence(found.reply) : '',
        datasets: datasetsOf(input, turn).length,
        plan: planLineOf(found, input),
        cards: byTurn.get(turn) ?? [],
        changed: changed(turn),
    };
};

export type PlanStepRow = {
    key: string;
    number: number;
    label: string;
    state: RowState;
    givesAnswer: boolean;
    /** The cards the step drew. */
    cards: { id: string; title: string }[];
    inReply: boolean;
};

export type PlanPage = {
    turn: number;
    title: string;
    meta: string;
    summary: string | null;
    steps: PlanStepRow[];
    choices: { key: string; label: string; value: string }[];
    caveats: string[];
    live: boolean;
    /** The plan as the full plan's dialog reads it. */
    view: PlanView;
};

/**
 * A question's plan as its page shows it. A card shows on the step that drew
 * it (its `planStep`) when that is a step of this plan, and on the answer
 * step otherwise: a card with no link, or one linked to another plan's step.
 * The answer step reads `in the reply` when no step drew a card. Each step
 * reads done once the turn has its reply.
 */
export const planPageOf = (input: SessionInput, turn: number): PlanPage | null => {
    const turns = turnsOf(input);
    const found = turns.find((each) => each.turn === turn);

    if (!found?.plan) return null;

    const { byTurn } = cardRows(input, turns);
    const cards = (byTurn.get(turn) ?? []).map(({ id, title }) => ({ id, title }));
    const replied = hasReply(found, input);
    const stopped = !replied && !running(found, input) && !found.planLive;
    const answerAt = found.plan.steps.findIndex((step) => step.givesAnswer);
    const answer = answerAt < 0 ? found.plan.steps.length - 1 : answerAt;
    const byId = new Map(input.widgets.map((widget) => [widget.id, widget]));
    const stepOf = (id: string): number => {
        const widget = byId.get(id);
        const link = widget && widget.kind !== 'text' ? widget.planStep : undefined;
        const at =
            link && link.plan_version_id === found.approved?.plan_version_id
                ? (found.approved.steps ?? []).findIndex((step) => step.id === link.plan_step_id)
                : -1;

        return at < 0 ? answer : at;
    };
    const stepState: RowState = found.planLive
        ? 'pending'
        : replied
          ? 'done'
          : stopped
            ? 'skipped'
            : 'pending';
    let meta = 'Done';

    if (found.planLive) meta = 'Waiting for you';
    else if (running(found, input)) meta = 'Working';
    else if (stopped) meta = 'Stopped';

    return {
        turn,
        title: found.plan.title || 'Research plan',
        meta,
        summary: found.plan.summary,
        steps: found.plan.steps.map((step, index) => ({
            key: step.key,
            number: index + 1,
            label: step.label,
            state: stepState,
            givesAnswer: index === answer,
            cards: found.planLive ? [] : cards.filter((card) => stepOf(card.id) === index),
            inReply: index === answer && replied && cards.length === 0,
        })),
        choices: found.plan.choices.map((choice) => ({
            key: choice.key,
            label: choice.name,
            value: choice.value,
        })),
        caveats: found.plan.caveats,
        live: found.planLive,
        view: found.plan,
    };
};

/** A page's title, as the back row of the page above it names it. */
export const pageTitleOf = (
    input: SessionInput,
    page: { kind: string; turn?: number; id?: string },
): string | null => {
    if (page.kind === 'card' && page.id) {
        return input.widgets.some((widget) => widget.id === page.id)
            ? input.titleOf(page.id)
            : null;
    }

    if (page.kind === 'source' && page.id) {
        return sourcesOf(input).find((source) => source.key === page.id)?.name ?? null;
    }

    if (page.kind === 'stage') return 'Data used';

    if (page.kind === 'plan' && page.turn !== undefined) {
        return planPageOf(input, page.turn)?.title ?? null;
    }

    if (page.kind === 'turn' && page.turn !== undefined) {
        return turnsOf(input).find((turn) => turn.turn === page.turn)?.question ?? null;
    }

    return null;
};

/** The source a source page shows, null once no card on the canvas uses it. */
export const sourcePageOf = (input: SessionInput, key: string): SourceRow | null =>
    sourcesOf(input).find((source) => source.key === key) ?? null;
