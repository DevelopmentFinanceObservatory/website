import { useStudioModel } from '../../../hooks/studioContext';
import { usePromptShell } from '../shellContext';
import { usePanelNav } from './panelNav';
import { Chevron } from './parts/Glyphs';
import { IconAction } from './parts/IconAction';
import { Mark } from './parts/Mark';
import partStyles from './parts/parts.module.scss';
import styles from './SessionPanel.module.scss';

import Icon from '@/components/atoms/Icon/Icon';
import { cardNode } from '@/lib/studio/cardImage';
import { stepCount } from '@/lib/studio/plan';
import type { CardRow, ChangedLine, PlanLine, SourceRow, StageRow } from '@/lib/studio/sessionView';

/**
 * Puts the card as it stands on the canvas on the clipboard as a PNG, drawn
 * as Download Image draws it (cardImage.ts): twice the screen's scale, on
 * the card's own face, without the controls marked `data-no-export`.
 */
const copyCardImage = async (node: HTMLElement): Promise<void> => {
    const { toBlob } = await import('html-to-image');
    const blob = await toBlob(node, {
        pixelRatio: 2,
        backgroundColor: getComputedStyle(node).backgroundColor,
        filter: (child) => !(child instanceof HTMLElement) || !child.hasAttribute('data-no-export'),
    });

    if (!blob) throw new Error('The image could not be written.');

    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
};

/** A card's row: glyph and title fly to the card, two actions, and the
 *  chevron that opens its page. */
export const CardRowItem = ({ row, pointed = false }: { row: CardRow; pointed?: boolean }) => {
    const { canvas, panels } = useStudioModel();
    const { show, fly } = usePanelNav();
    const widget = canvas.widgets.find((each) => each.id === row.id);

    return (
        <li className={styles.card} data-sp-out={row.id} data-pointed={pointed || undefined}>
            <button
                type="button"
                className={styles.cardMain}
                title={row.title}
                aria-label={`${row.title}, ${row.tag.toLowerCase()}. Show on the canvas`}
                data-sp-fly={row.id}
                data-sp-key={`fly:${row.id}`}
                onClick={() => fly(row.id)}
            >
                <span className={styles.glyph} aria-hidden="true">
                    <Icon name={row.glyph} />
                </span>
                <span className={styles.cardTitle}>{row.title}</span>
            </button>
            <button
                type="button"
                className={styles.more}
                aria-label={`About ${row.title}`}
                data-sp-card={row.id}
                data-sp-key={`more:${row.id}`}
                onClick={() => show({ kind: 'card', id: row.id }, `more:${row.id}`)}
            >
                <Chevron direction="right" />
            </button>
            <span className={styles.acts}>
                {row.text ? (
                    <IconAction
                        icon="copy"
                        label="Copy text"
                        doneLabel="Text copied"
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
                            subject={row.title}
                            data-sp-act="image"
                            data-sp-key={`image:${row.id}`}
                            onAction={async () => {
                                const node = cardNode(row.id);

                                if (!node) return false;

                                await copyCardImage(node);
                            }}
                        />
                    </>
                )}
            </span>
            {row.change && (
                <p className={styles.change} data-state={row.change.state} role="status">
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
    const { dispatch } = usePromptShell();
    const { show } = usePanelNav();
    const key = `plan:${plan.turn}`;
    const light = (on: boolean) => dispatch({ type: 'plan.light', turn: on ? plan.turn : null });

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

/** A source as a row: its name, then how far its data runs; opens the
 *  source's page. */
export const SourceRowButton = ({ source }: { source: SourceRow }) => {
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
            {source.through && <span className={partStyles.mono}>{source.through}</span>}
        </button>
    );
};
