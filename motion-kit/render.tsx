import classNames from 'classnames';
import type { CSSProperties } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { type ChartLayout, layoutChart, renderPlot, type SeriesPath } from './chart.tsx';
import { outfitMeasure } from './fontMetrics.ts';
import { addAttributes, type Element, hasClass, parseMarkup, walk } from './html.ts';
import { CELL, DEFAULT_VIEWPORT, type DemoSpec, WRAPPER } from './spec.ts';

import Button from '@/components/atoms/Button/Button';
import buttonStyles from '@/components/atoms/Button/Button.module.scss';
import GridPattern from '@/components/atoms/GridPattern/GridPattern';
import segmentedStyles from '@/components/molecules/SegmentedTabs/SegmentedTabs.module.scss';
import Header from '@/components/organisms/Header/Header';
import cardStyles from '@/components/organisms/Studio/canvas/cards/Card.module.scss';
import CardBody from '@/components/organisms/Studio/canvas/cards/CardBody';
import CardChrome from '@/components/organisms/Studio/canvas/cards/CardChrome';
import CardHead from '@/components/organisms/Studio/canvas/cards/CardHead';
import chartStyles from '@/components/organisms/Studio/canvas/cards/ChartCard.module.scss';
import type { CardExtras } from '@/components/organisms/Studio/canvas/cards/types';
import { legendShown } from '@/components/organisms/Studio/canvas/chart/chartDatasets';
import { seriesVars } from '@/components/organisms/Studio/canvas/chart/chartSetup';
import {
    effectiveKind,
    GAP,
    heightIsDerived,
    resolveCardView,
    spawnSpan,
    widgetTitle,
} from '@/components/organisms/Studio/canvas/layout';
import boardStyles from '@/components/organisms/Studio/canvas/Whiteboard.module.scss';
import type { useChat } from '@/components/organisms/Studio/hooks/useChat';
import studioStyles from '@/components/organisms/Studio/Studio.module.scss';
import activityStyles from '@/components/organisms/Studio/workspace/ActivityLog.module.scss';
import pillStyles from '@/components/organisms/Studio/workspace/ApprovedPlanPill.module.scss';
import ChatPanel from '@/components/organisms/Studio/workspace/ChatPanel';
import chatStyles from '@/components/organisms/Studio/workspace/ChatPanel.module.scss';
import barStyles from '@/components/organisms/Studio/workspace/PlanApproveBar.module.scss';
import planStyles from '@/components/organisms/Studio/workspace/PlanCard.module.scss';
import WorkspaceToolbar from '@/components/organisms/Studio/workspace/WorkspaceToolbar';
import type { ChartWidget, Widget } from '@/lib/chat/widgets';
import { cardRefOf } from '@/lib/studio/cardDownload';
import { legendLabels } from '@/lib/studio/seriesLabels';
import { DEFAULT_THEME, deriveTheme, type ThemeDerived, themeVars } from '@/lib/studio/theme';
import { isPrompt } from '@/lib/studio/transcript';

/**
 * The Studio workspace as static markup: the skeleton of Studio.tsx and the
 * slots of Whiteboard.tsx, rebuilt here because both fill themselves from
 * effects, around the app's own components (Header, WorkspaceToolbar,
 * ChatPanel, CardBody, CardHead, CardChrome). A chart card keeps
 * ChartCard's DOM with the canvas swapped for the plot Chart.js draws in
 * Node (chart.tsx).
 */

// A card's padding and border on each side (Card.module.scss `.card`):
// rem(16) and 1 px, which the plot's width leaves out.
const CARD_INSET = 2 * 16 + 2;

const noop = () => {};

export type CardOut = {
    id: string;
    kind: Widget['kind'];
    hook: string;
    col: number;
    row: number;
    w: number;
    h: number;
    // px on the whiteboard sheet, from its top-left corner.
    x: number;
    y: number;
    width: number;
    height: number;
};

export type ChartOut = {
    cardId: string;
    line: boolean;
    plot: { width: number; height: number };
    valueTicks: ChartLayout['valueTicks'];
    valueTitle: string | null;
    series: (SeriesPath & { label: string })[];
};

export type Rendered = {
    html: string;
    hooks: string[];
    cards: CardOut[];
    charts: ChartOut[];
    // Hashed class names an animation toggles: the chat panel's active view.
    classes: Record<string, string>;
    // Rules for the states the app sets from measurements in effects.
    css: string;
    states: PlanStates;
};

/** The plan's two states, both in the one fragment: the hooks that belong
 *  to each, for a film to show one and hide the other, and the attributes
 *  that change once the plan is approved (the chat input's placeholder and
 *  label), by hook. A state the spec does not hold is absent. */
export type PlanStates = {
    pending?: { hooks: string[] };
    approved?: { hooks: string[]; attrs: Record<string, Record<string, string>> };
};

// --- cards ----------------------------------------------------------------------

const extrasFor = (widget: Widget): CardExtras => {
    const { view, choices } = resolveCardView(widget, undefined);
    const isText = widget.kind === 'text';

    return {
        pinned: false,
        title: widgetTitle(widget),
        view,
        viewChoices: choices,
        onPin: noop,
        onRemove: noop,
        onAsk: noop,
        onInfo: isText ? null : noop,
        onDownload: cardRefOf(widget) ? noop : null,
        onDownloadImage: noop,
        onEdit: noop,
        editLabel: isText ? 'Edit Card' : 'Edit Title',
        onNote: isText ? null : noop,
        onRemoveNote: isText ? null : noop,
        onView: noop,
        onShare: noop,
        readOnly: false,
    };
};

// ChartCard's DOM (head, legend, plot, chrome) around the drawn plot.
const StaticChartCard = ({
    widget,
    theme,
    extras,
    plot,
    plotHeight,
}: {
    widget: ChartWidget;
    theme: ThemeDerived;
    extras: CardExtras;
    plot: React.ReactNode;
    plotHeight: number;
}) => {
    const names = legendLabels(widget.series.map((s) => s.label));

    // The app measures the card's chrome and gives the card the rows that
    // chrome and the plot need. Here the plot keeps its height and the card
    // grows past its slot when the chrome needs more than the slot gives.
    return (
        <article className={cardStyles.card} style={{ height: 'auto', minHeight: '100%' }}>
            <CardHead {...extras} />
            {legendShown(widget) && (
                <ul className={chartStyles.legend}>
                    {widget.series.map((s, index) => (
                        <li key={s.label}>
                            <button
                                type="button"
                                title={s.label}
                                aria-pressed
                                aria-label={`${s.label} — hide this series`}
                                className={chartStyles.legendItem}
                            >
                                <span
                                    className={chartStyles.legendDot}
                                    style={seriesVars(theme.series, index)}
                                />
                                <span className={chartStyles.legendName}>{names[index]}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <div className={chartStyles.plot} style={{ flex: '1 0 auto', minHeight: plotHeight }}>
                {plot}
            </div>
            <CardChrome source={widget.source} info={widget.info} onInfo={extras.onInfo} />
        </article>
    );
};

type Placed = {
    widget: Widget;
    col: number;
    row: number;
    w: number;
    h: number;
    body: React.ReactNode;
};

// A Whiteboard slot (Whiteboard.tsx): position and size in cells, the card
// box with its grab bar and resize grip, the card inside.
const Slot = ({ placed }: { placed: Placed }) => {
    const { widget, col, row, w, h, body } = placed;
    const { view } = resolveCardView(widget, undefined);
    const isText = widget.kind === 'text';

    return (
        <div
            className={boardStyles.slot}
            data-card-id={widget.id}
            data-v={`card-${widget.id}`}
            style={
                {
                    left: col * CELL,
                    top: row * CELL,
                    zIndex: 1,
                    translate: '0px 0px',
                    width: w * CELL,
                    height: h * CELL,
                    '--tilt': '0deg',
                } as CSSProperties
            }
        >
            <div className={boardStyles.cardBox} data-draggable="">
                <span className={boardStyles.handle} data-nowave="" />
                {!isText && (
                    <span
                        className={classNames(
                            boardStyles.resizeGrip,
                            heightIsDerived(widget, view) && boardStyles.resizeGripWidth,
                        )}
                        data-nowave=""
                    >
                        <svg viewBox="0 0 10 10" aria-hidden="true">
                            <path d="M2.5 9 9 2.5M6 9 9 6" />
                        </svg>
                    </span>
                )}
                {body}
            </div>
        </div>
    );
};

// --- the workspace --------------------------------------------------------------

const cardTabsOf = (widgets: Widget[]) => {
    // Studio.tsx's tabs: a kind gets a tab once it is on the sheet.
    const counts = widgets.reduce<Record<string, number>>((acc, widget) => {
        const kind = effectiveKind(widget, undefined);

        acc[kind] = (acc[kind] ?? 0) + 1;

        return acc;
    }, {});
    const tabFor = (id: string, label: string, kind: string) =>
        counts[kind] ? [{ id, label, count: counts[kind] }] : [];

    return [
        { id: 'all', label: 'All', count: widgets.length },
        ...tabFor('stats', 'Stats', 'key_number'),
        ...tabFor('charts', 'Charts', 'chart'),
        ...tabFor('tables', 'Tables', 'table'),
        ...tabFor('notes', 'Notes', 'text'),
    ];
};

const chatOf = (spec: DemoSpec): ReturnType<typeof useChat> => {
    // Every card belongs to the turn of the last answer.
    const lastBot = spec.messages.findLastIndex((message) => message.role === 'bot');
    const turn = spec.messages.slice(0, Math.max(lastBot, 0)).filter(isPrompt).length;

    return {
        messages: spec.messages,
        widgets: spec.cards.map(({ widget }) => ({ ...widget, turn })),
        queued: [],
        activity: spec.activity ?? [],
        status: null,
        statusDetail: null,
        statusSince: null,
        stalled: false,
        thinking: false,
        clarify: null,
        plan: spec.plan ?? null,
        agentRemovals: 0,
        takeAgentRemoved: () => [],
        syncCanvas: noop,
        reportHidden: noop,
        canvasVersion: 0,
        send: noop,
        unqueue: noop,
        answerClarify: noop,
        skipClarify: noop,
        respondPlan: noop,
        switchChoice: noop,
        applyChoice: noop,
        stop: noop,
        reset: noop,
        hydrate: noop,
        snapshot: () => ({ sessionId: null, componentRefs: [], turnCount: turn, canvas: null }),
    };
};

const Workspace = ({ spec, placed }: { spec: DemoSpec; placed: Placed[] }) => {
    const theme = deriveTheme(DEFAULT_THEME);
    const widgets = spec.cards.map((card) => card.widget);
    const rightCol = Math.max(0, ...placed.map((card) => card.col + card.w));
    const bottomRow = Math.max(0, ...placed.map((card) => card.row + card.h));

    return (
        <section className={studioStyles.section}>
            <div
                className={classNames(studioStyles.canvas, studioStyles.canvasDocked)}
                aria-hidden="true"
            >
                <div className={studioStyles.canvasInner}>
                    <GridPattern variant="light" cell={CELL} />
                </div>
            </div>

            <div
                className={studioStyles.canvasContent}
                style={themeVars(theme) as CSSProperties}
                data-v="canvas"
            >
                <div
                    className={boardStyles.board}
                    style={{ width: (rightCol + GAP) * CELL, height: (bottomRow + GAP) * CELL }}
                >
                    <div className={boardStyles.gridLayer} style={{ top: -CELL, left: -CELL }}>
                        <GridPattern variant="light" cell={CELL} />
                    </div>
                    {placed.map((card) => (
                        <Slot key={card.widget.id} placed={card} />
                    ))}
                </div>
            </div>

            <Header variant="studio" onBack={noop} account={false}>
                <Button
                    variant="bordered"
                    className={studioStyles.barExtra}
                    style={{ '--i': 0 } as CSSProperties}
                    onClick={noop}
                >
                    New Chat
                </Button>
                <Button
                    variant="bordered"
                    className={studioStyles.barExtra}
                    style={{ '--i': 1 } as CSSProperties}
                    onClick={noop}
                >
                    Customize
                </Button>
                <Button
                    variant="dark"
                    wide
                    icon="arrow-up-right"
                    className={studioStyles.barExtra}
                    style={{ '--i': 2 } as CSSProperties}
                    onClick={noop}
                >
                    Share
                </Button>
            </Header>

            <div className={studioStyles.workspace}>
                <WorkspaceToolbar
                    chatTab="chat"
                    onChatTab={noop}
                    chatCollapsed={false}
                    onChatCollapsed={noop}
                    cardTabs={widgets.length ? cardTabsOf(widgets) : null}
                    cardsTab="all"
                    onCardsTab={noop}
                    solo={false}
                    readOnly={false}
                    title={spec.title}
                    onEditTitle={noop}
                    phone={false}
                    onNewChat={noop}
                    onCustomize={noop}
                    onShare={noop}
                />
                <ChatPanel
                    editTarget={null}
                    onClearEditTarget={noop}
                    chat={chatOf(spec)}
                    tab="chat"
                    collapsed={false}
                    gone={false}
                    readOnly={false}
                    shareMarks={[]}
                    titles={{}}
                    views={{}}
                    onCanvas={() => true}
                    onGo={noop}
                    onAdd={noop}
                    onRemove={noop}
                />
            </div>
        </section>
    );
};

// --- hooks ----------------------------------------------------------------------

const only = (elements: Element[], what: string): Element => {
    if (elements.length !== 1) {
        throw new Error(`render: expected one ${what}, found ${elements.length}`);
    }

    return elements[0]!;
};

/** The hooks of each plan state: the card awaiting approval with its
 *  approve bar (pending), and the pill under the answer (approved). A
 *  state the spec does not hold has none. */
const planHooks = (spec: DemoSpec): { pending: string[]; approved: string[] } => ({
    pending: spec.plan ? ['plan', ...(spec.plan.live ? ['plan-bar', 'plan-approve'] : [])] : [],
    approved: spec.messages.some((message) => message.role === 'bot' && message.plan)
        ? ['plan-pill']
        : [],
});

// The chat input's attributes in `markup`.
const promptAttrs = (markup: string): Record<string, string> => {
    const foot = only(
        walk(parseMarkup(markup)).filter((el) => hasClass(el, chatStyles.chatFoot!)),
        'chat foot',
    );

    return only(
        walk(foot.children).filter((el) => el.name === 'textarea'),
        'prompt field',
    ).attrs;
};

const planStates = (spec: DemoSpec, placed: Placed[], markup: string): PlanStates => {
    const { pending, approved } = planHooks(spec);

    if (!approved.length) {
        return pending.length ? { pending: { hooks: pending } } : {};
    }

    // What the chat foot says once no plan waits: rendered without the plan.
    const before = promptAttrs(markup);
    const after = promptAttrs(
        renderToStaticMarkup(<Workspace spec={{ ...spec, plan: undefined }} placed={placed} />),
    );
    const changed = Object.entries(after).filter(([name, value]) => before[name] !== value);

    return {
        ...(pending.length ? { pending: { hooks: pending } } : {}),
        approved: {
            hooks: approved,
            attrs: changed.length ? { prompt: Object.fromEntries(changed) } : {},
        },
    };
};

// The hooks inside the app's own components, found by their classes.
const chatHooks = (html: string, spec: DemoSpec): string => {
    const all = walk(parseMarkup(html));
    const within = (root: Element) => walk(root.children);
    const additions: { element: Element; name: string; value: string }[] = [];
    const hook = (element: Element, value: string) =>
        additions.push({ element, name: 'data-v', value });

    const panel = only(
        all.filter((el) => hasClass(el, chatStyles.chatPanel!)),
        'chat panel',
    );
    const views = all.filter((el) => hasClass(el, chatStyles.view!));
    const [chatView, activityView] = views;

    if (views.length !== 2 || !chatView || !activityView) {
        throw new Error(`render: expected the chat and activity views, found ${views.length}`);
    }

    hook(panel, 'chat');
    hook(chatView, 'view-chat');
    hook(activityView, 'view-activity');

    const transcript = only(
        within(chatView).filter((el) => hasClass(el, chatStyles.chatScroll!)),
        'transcript',
    );

    if (transcript.children.length !== spec.messages.length) {
        throw new Error(
            `render: ${spec.messages.length} messages drew ${transcript.children.length} elements`,
        );
    }

    transcript.children.forEach((element, index) => hook(element, `msg-${index}`));

    const foot = only(
        within(chatView).filter((el) => hasClass(el, chatStyles.chatFoot!)),
        'chat foot',
    );

    hook(
        only(
            within(foot).filter((el) => el.name === 'textarea'),
            'prompt field',
        ),
        'prompt',
    );
    hook(
        only(
            within(foot).filter((el) => el.name === 'button' && el.attrs.type === 'submit'),
            'send button',
        ),
        'send',
    );

    // The plan awaiting approval (PlanCard in the chat foot) and the approved
    // plan under its answer (ApprovedPlanPill): planHooks names them.
    const names = planHooks(spec);

    if (names.pending.length) {
        const card = only(
            within(foot).filter((el) => el.name === 'section' && hasClass(el, planStyles.plan!)),
            'plan card',
        );

        hook(card, 'plan');

        if (spec.plan?.live) {
            const bar = only(
                within(foot).filter((el) => hasClass(el, barStyles.bar!)),
                'approve bar',
            );

            hook(bar, 'plan-bar');
            hook(
                only(
                    within(bar).filter(
                        (el) => el.name === 'button' && hasClass(el, buttonStyles.dark!),
                    ),
                    'Approve button',
                ),
                'plan-approve',
            );
        }
    }

    if (names.approved.length) {
        hook(
            only(
                within(transcript).filter((el) => hasClass(el, pillStyles.pill!)),
                'approved plan pill',
            ),
            'plan-pill',
        );
    }

    within(activityView)
        .filter((el) => el.name === 'section' && hasClass(el, activityStyles.turn!))
        .forEach((turn, index) => {
            hook(turn, `activity-${index}`);
            within(turn)
                .filter((el) => el.name === 'li' && hasClass(el, activityStyles.tool!))
                .forEach((line, step) => hook(line, `activity-${index}-${step}`));
        });

    // The app's entrance reveals start hidden until an observer marks them;
    // the film shows them revealed.
    for (const element of all) {
        if ('data-reveal' in element.attrs || 'data-reveal-group' in element.attrs) {
            additions.push({ element, name: 'data-revealed', value: '' });
        }
    }

    return addAttributes(html, additions);
};

const hooksIn = (html: string): string[] =>
    walk(parseMarkup(html)).flatMap((element) => element.attrs['data-v'] ?? []);

// SegmentedTabs measures the active tab in an effect and slides its
// indicator (SegmentedTabs.module.scss `.indicator`: the pill's full height,
// charcoal, the tab's own radius) under it. The film paints the active tab.
const measuredStates = `.${segmentedStyles.choice}[data-active="true"] { background-color: var(--color-charcoal); }\n`;

/** A chart laid out in the default theme at `width` px, as a card shows it. */
export const layoutDefaultChart = (
    widget: ChartWidget,
    { line, width, fontsDir }: { line: boolean; width: number; fontsDir: string },
): ChartLayout =>
    layoutChart({
        widget,
        line,
        theme: deriveTheme(DEFAULT_THEME),
        width,
        measure: outfitMeasure(fontsDir),
    });

// --- entry ----------------------------------------------------------------------

export const renderStudio = (spec: DemoSpec, { fontsDir }: { fontsDir: string }): Rendered => {
    const theme = deriveTheme(DEFAULT_THEME);
    const measure = outfitMeasure(fontsDir);
    const charts: ChartOut[] = [];

    const placed: Placed[] = spec.cards.map(({ widget, slot }) => {
        const resolved = resolveCardView(widget, undefined);
        const span = spawnSpan(widget, resolved);
        const w = slot.w ?? span.w;
        const h = slot.h ?? span.h;
        const extras = extrasFor(widget);
        const { view, chartSource } = resolved;
        let body: React.ReactNode;

        if ((view === 'chart-bar' || view === 'chart-line') && chartSource) {
            const line = view === 'chart-line';
            const layout = layoutChart({
                widget: chartSource,
                line,
                theme,
                width: w * CELL - CARD_INSET,
                measure,
            });
            const plot = renderPlot(layout, widget.id, line);

            charts.push({
                cardId: widget.id,
                line,
                plot: { width: layout.width, height: layout.height },
                valueTicks: layout.valueTicks,
                valueTitle: layout.valueTitle,
                series: plot.series.map((path) => ({
                    ...path,
                    label: chartSource.series[path.index]?.label ?? '',
                })),
            });
            body = (
                <StaticChartCard
                    widget={chartSource}
                    theme={theme}
                    extras={extras}
                    plot={plot.node}
                    plotHeight={layout.height}
                />
            );
        } else {
            body = (
                <CardBody
                    widget={widget}
                    view={view}
                    chartSource={chartSource}
                    scale={1}
                    theme={theme}
                    widthCells={w}
                    heightCells={h}
                    onFit={noop}
                    extras={extras}
                />
            );
        }

        return { widget, col: slot.col, row: slot.row, w, h, body };
    });

    const viewport = spec.viewport ?? DEFAULT_VIEWPORT;
    const markup = renderToStaticMarkup(<Workspace spec={spec} placed={placed} />);
    const html = chatHooks(markup, spec);
    const states = planStates(spec, placed, markup);
    const hooks = hooksIn(html);
    const expected = [
        'chat',
        'canvas',
        'prompt',
        'send',
        ...spec.messages.map((_, index) => `msg-${index}`),
        ...(states.pending?.hooks ?? []),
        ...(states.approved?.hooks ?? []),
        ...(spec.activity ?? []).map((_, index) => `activity-${index}`),
        ...spec.cards.map(({ widget }) => `card-${widget.id}`),
        ...charts.flatMap((chart) => chart.series.map((series) => series.hook)),
    ];

    for (const name of expected) {
        const count = hooks.filter((other) => other === name).length;

        if (count !== 1) {
            throw new Error(`render: hook "${name}" appears ${count} times`);
        }
    }

    return {
        html: `<div class="${WRAPPER}" data-viewport="${viewport.width}x${viewport.height}">${html}</div>`,
        hooks,
        cards: placed.map(({ widget, col, row, w, h }) => ({
            id: widget.id,
            kind: widget.kind,
            hook: `card-${widget.id}`,
            col,
            row,
            w,
            h,
            x: col * CELL,
            y: row * CELL,
            width: w * CELL,
            height: h * CELL,
        })),
        charts,
        classes: { viewActive: chatStyles.viewActive! },
        css: measuredStates,
        states,
    };
};
