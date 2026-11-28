import classNames from 'classnames';
import { useEffect, useRef } from 'react';

import { useStudioModel } from '../../../hooks/studioContext';
import { usePromptShell } from '../shellContext';
import { usePanelNav } from './panelNav';
import { Chevron } from './parts/Glyphs';
import { IconAction } from './parts/IconAction';
import { Mark } from './parts/Mark';
import partStyles from './parts/parts.module.scss';
import styles from './SessionPanel.module.scss';

import Icon from '@/components/atoms/Icon/Icon';
import { cardImageBlob, cardNode } from '@/lib/studio/cardImage';
import { stepCount } from '@/lib/studio/plan';
import type { CardRow, ChangedLine, PlanLine, SourceRow, StageRow } from '@/lib/studio/sessionView';

/**
 * Puts the card as it stands on the canvas on the clipboard as a PNG, drawn
 * as Download Image draws it (cardImageBlob). The write starts in the click
 * with the image still to come, since Safari refuses a clipboard write made
 * after an await.
 */
const copyCardImage = (node: HTMLElement): Promise<void> =>
    navigator.clipboard.write([new ClipboardItem({ 'image/png': cardImageBlob(node) })]);

/** A card's row: glyph and title open the card's page, which brings the
 *  card into view on the canvas, then two actions. The chevron is the same
 *  press for a pointer, so the title is the row's one stop for it. */
export const CardRowItem = ({ row, pointed = false }: { row: CardRow; pointed?: boolean }) => {
    const { canvas, panels } = useStudioModel();
    const { show } = usePanelNav();
    const widget = canvas.widgets.find((each) => each.id === row.id);
    const open = () => show({ kind: 'card', id: row.id }, `more:${row.id}`);

    return (
        <li className={styles.card} data-sp-out={row.id} data-pointed={pointed || undefined}>
            <button
                type="button"
                className={styles.cardMain}
                title={row.title}
                aria-label={`About ${row.title}, ${row.tag.toLowerCase()}`}
                data-sp-card={row.id}
                data-sp-key={`more:${row.id}`}
                onClick={open}
            >
                <span className={styles.glyph} aria-hidden="true">
                    <Icon name={row.glyph} />
                </span>
                <span className={styles.cardTitle}>{row.title}</span>
            </button>
            <button
                type="button"
                className={styles.more}
                tabIndex={-1}
                aria-hidden="true"
                data-sp-more=""
                onClick={open}
            >
                <Chevron direction="right" />
            </button>
            <span className={styles.acts}>
                {row.text ? (
                    <IconAction
                        icon="copy"
                        label="Copy text"
                        doneLabel="Text copied"
                        failLabel="Text not copied"
                        subject={row.title}
                        data-sp-act="text"
                        data-sp-key={`text:${row.id}`}
                        onAction={() =>
                            navigator.clipboard.writeText(
                                widget?.kind === 'text' ? widget.body || row.title : row.title,
                            )
                        }
                    />
                ) : (
                    <>
                        {row.data && (
                            <IconAction
                                icon="download"
                                label="Download data"
                                subject={row.title}
                                aria-haspopup="dialog"
                                data-sp-act="data"
                                data-sp-key={`data:${row.id}`}
                                onAction={() => panels.setDownloadCardId(row.id)}
                            />
                        )}
                        <IconAction
                            icon="copy"
                            label="Copy image"
                            doneLabel="Image copied"
                            failLabel="Image not copied"
                            subject={row.title}
                            data-sp-act="image"
                            data-sp-key={`image:${row.id}`}
                            onAction={() => {
                                const node = cardNode(row.id);

                                return node ? copyCardImage(node) : false;
                            }}
                        />
                    </>
                )}
            </span>
            {row.change && (
                <p className={styles.change} data-state={row.change.state}>
                    {row.change.state === 'running' ? 'Changing…' : row.change.text}
                </p>
            )}
        </li>
    );
};

/** `Changed <title>` for each card a question changed that an earlier one
 *  made; a title on the canvas flies to the card. */
export const ChangedLines = ({ lines }: { lines: ChangedLine[] }) => {
    const { fly } = usePanelNav();

    return lines.map((line) => (
        <li key={line.id} className={styles.did}>
            <span className={`${partStyles.mono} ${styles.didVerb}`}>Changed</span>
            {line.onCanvas ? (
                <button
                    type="button"
                    className={styles.didTitle}
                    title={line.title}
                    data-sp-fly={line.id}
                    data-sp-key={`changed:${line.id}`}
                    onClick={() => fly(line.id)}
                >
                    {line.title}
                </button>
            ) : (
                <span className={styles.didTitle} title={line.title}>
                    {line.title}
                </span>
            )}
        </li>
    ));
};

/** A question's progress, a row per stage. Rows are not buttons. */
export const StageList = ({ stages, turn }: { stages: StageRow[]; turn: number }) => (
    <ol className={styles.stages} aria-label="Progress">
        {stages.map((stage) => (
            <li
                key={stage.id}
                className={styles.stage}
                data-sp-stage={stage.id}
                data-sp-of={turn}
                data-state={stage.state}
            >
                <Mark state={stage.state} />
                <span className={styles.stageBody}>
                    <span className={styles.stageLabel}>{stage.label}</span>
                    {stage.note && <span className={styles.note}>{stage.note}</span>}
                </span>
            </li>
        ))}
    </ol>
);

/** `Research plan · N steps` and its state; opens the plan's page. Pointer
 *  or focus on it lights the plan's cards on the canvas. */
export const PlanLineButton = ({
    plan,
    pointed = false,
}: {
    plan: PlanLine;
    pointed?: boolean;
}) => {
    const { state, dispatch } = usePromptShell();
    const { show } = usePanelNav();
    const key = `plan:${plan.turn}`;
    const light = (on: boolean) => dispatch({ type: 'plan.light', turn: on ? plan.turn : null });
    const lit = state.litPlan === plan.turn;
    const litNow = useRef(lit);

    useEffect(() => {
        litNow.current = lit;
    });

    // A line that leaves while its plan is lit fires no pointer leave or
    // blur, so it puts the light out as it goes.
    useEffect(
        () => () => {
            if (litNow.current) dispatch({ type: 'plan.light', turn: null });
        },
        [dispatch],
    );

    return (
        <button
            type="button"
            className={styles.planLine}
            aria-label={`Research plan, ${stepCount(plan.steps)}${plan.state ? `, ${plan.state}` : ''}`}
            data-sp-plan={plan.turn}
            data-sp-key={key}
            data-pointed={pointed || undefined}
            onClick={() => show({ kind: 'plan', turn: plan.turn }, key)}
            onPointerEnter={() => light(true)}
            onPointerLeave={(event) => {
                // A line that keeps focus keeps its cards lit.
                if (document.activeElement !== event.currentTarget) light(false);
            }}
            onFocus={() => light(true)}
            onBlur={() => light(false)}
        >
            <span className={styles.glyph} aria-hidden="true">
                <Icon name="list" />
            </span>
            <span className={styles.planText}>
                <span>Research plan · {stepCount(plan.steps)}</span>
                {plan.state && <span className={partStyles.mono}>{plan.state}</span>}
            </span>
            <Chevron direction="right" />
        </button>
    );
};

/** A source as a row: its name, then how far its data runs and its
 *  licence; opens the source's page, which resolves while a card on the
 *  canvas uses the source (sourcePageOf). */
export const SourceRowButton = ({
    source,
}: {
    source: Pick<SourceRow, 'key' | 'name' | 'meta'>;
}) => {
    const { show } = usePanelNav();
    const key = `src:${source.key}`;

    return (
        <button
            type="button"
            className={styles.source}
            data-sp-source={source.key}
            data-sp-key={key}
            onClick={() => show({ kind: 'source', id: source.key }, key)}
        >
            <span className={styles.sourceTop}>
                <span className={styles.sourceName}>{source.name}</span>
                <Chevron direction="right" />
            </span>
            {source.meta && (
                <span className={classNames(partStyles.mono, partStyles.one)} title={source.meta}>
                    {source.meta}
                </span>
            )}
        </button>
    );
};
