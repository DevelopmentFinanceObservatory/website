import { useEffect, useId, useRef, useState } from 'react';

import { useStudioModel } from '../../../hooks/studioContext';
import { usePromptShell } from '../shellContext';
import { usePanelNav } from './panelNav';
import { CardChip, Chips, CountChip } from './parts/CardChip';
import { Fold } from './parts/Fold';
import { CONFIRM_MS } from './parts/IconAction';
import { Section } from './parts/Section';
import { TextButton } from './parts/TextButton';
import { CardRowItem, ChangedLines, PlanLineButton, SourceRowButton, StageList } from './Rows';
import styles from './SessionPanel.module.scss';

import Icon from '@/components/atoms/Icon/Icon';
import type { PlanLinks } from '@/lib/studio/planLink';
import {
    earlierWords,
    type Group,
    KEEP_OPEN_UP_TO,
    type Overview as OverviewView,
} from '@/lib/studio/sessionView';

/** The overview's folds, kept by the panel so they hold while a page is open. */
export type Folds = { earlier: boolean; removed: boolean; keep: boolean | null };

type OverviewProps = {
    view: OverviewView;
    links: PlanLinks;
    folds: Folds;
    setFolds: (next: Folds) => void;
};

const GroupBlock = ({ group, links }: { group: Group; links: PlanLinks }) => {
    const { state } = usePromptShell();
    const { show } = usePanelNav();
    const pointed = state.pointedCard;
    const pointedPlan = pointed ? links.planOf(pointed)?.turn : undefined;
    const key = `turn:${group.turn}`;
    const open = () => show({ kind: 'turn', turn: group.turn }, key);

    return (
        <li className={styles.group} data-sp-group={group.turn}>
            <button
                type="button"
                className={
                    group.newest ? `${styles.question} ${styles.questionNewest}` : styles.question
                }
                title={group.question}
                data-sp-turn={group.turn}
                data-sp-key={key}
                onClick={open}
            >
                {group.question}
            </button>
            {group.newest && !group.quiet && <p className={styles.state}>{group.words}</p>}
            {group.stages.length > 0 && <StageList stages={group.stages} turn={group.turn} />}
            <ul className={styles.items}>
                {group.plan && (
                    <li>
                        <PlanLineButton
                            plan={group.plan}
                            pointed={pointedPlan === group.plan.turn}
                        />
                    </li>
                )}
                {group.cards.map((row) => (
                    <CardRowItem key={row.id} row={row} pointed={row.id === pointed} />
                ))}
                <ChangedLines lines={group.changed} />
                {group.quiet && (
                    <li className={styles.did}>
                        <button type="button" className={styles.words} onClick={open}>
                            {group.words}
                        </button>
                    </li>
                )}
            </ul>
        </li>
    );
};

const CardsSection = ({ view, links, folds, setFolds }: OverviewProps) => {
    const { canvas } = useStudioModel();
    const groupsId = useId();
    const removedId = useId();
    const hidden = view.earlier?.questions ?? 0;
    const shown = folds.earlier ? view.groups : view.groups.slice(hidden);

    return (
        <Section
            id="sp-cards"
            label="Cards"
            count={view.cardCount > 0 ? view.cardCount : null}
            data-sp-cards
        >
            {view.earlier && (
                <Fold
                    open={folds.earlier}
                    controls={groupsId}
                    data-sp-fold="earlier"
                    onToggle={() => setFolds({ ...folds, earlier: !folds.earlier })}
                >
                    {folds.earlier ? 'Show fewer questions' : earlierWords(view.earlier)}
                </Fold>
            )}
            <ol id={groupsId} className={styles.groups}>
                {shown.map((group) => (
                    <GroupBlock key={group.turn} group={group} links={links} />
                ))}
            </ol>
            {view.removed.length > 0 && (
                <>
                    <Fold
                        open={folds.removed}
                        controls={removedId}
                        data-sp-fold="removed"
                        onToggle={() => setFolds({ ...folds, removed: !folds.removed })}
                    >
                        {view.removed.length} removed
                    </Fold>
                    {folds.removed && (
                        <ul id={removedId} className={styles.gones}>
                            {view.removed.map((row) => (
                                <li key={row.id} className={styles.gone}>
                                    <span className={styles.glyph} aria-hidden="true">
                                        <Icon name={row.glyph} />
                                    </span>
                                    <span className={styles.goneTitle} title={row.title}>
                                        {row.title}
                                    </span>
                                    <button
                                        type="button"
                                        className={styles.restore}
                                        aria-label={`Restore ${row.title} to the canvas`}
                                        data-sp-restore={row.id}
                                        onClick={() => canvas.add(row.id)}
                                    >
                                        Restore
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            )}
        </Section>
    );
};

const KeepSection = ({ view, folds, setFolds }: OverviewProps) => {
    const keepsId = useId();
    const open = folds.keep ?? view.keep.length <= KEEP_OPEN_UP_TO;

    if (view.keep.length === 0) return null;

    return (
        <Section
            aria-label="Keep in mind"
            label={
                <Fold
                    open={open}
                    controls={keepsId}
                    className={styles.keepFold}
                    data-sp-fold="keep"
                    onToggle={() => setFolds({ ...folds, keep: !open })}
                >
                    Keep in mind
                </Fold>
            }
            count={view.keep.length}
        >
            {open && (
                <ul id={keepsId} className={styles.keeps}>
                    {view.keep.map((keep) => (
                        <li key={keep.text} className={styles.keep}>
                            <span>{keep.text}</span>
                            {keep.cards.length > 0 && (
                                <Chips>
                                    {keep.cards.length > 2 ? (
                                        <CountChip count={keep.cards.length} />
                                    ) : (
                                        keep.cards.map((card) => (
                                            <CardChip
                                                key={card.id}
                                                id={card.id}
                                                title={card.title}
                                            />
                                        ))
                                    )}
                                </Chips>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </Section>
    );
};

const SourcesSection = ({ view }: { view: OverviewView }) => {
    const { announce } = usePromptShell();
    const [copied, setCopied] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    useEffect(() => () => clearTimeout(timer.current), []);

    if (view.sources.length === 0) return null;

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(view.citations.join('\n\n'));
        } catch (error) {
            console.error(error);

            return;
        }

        setCopied(true);
        announce('Citations copied');
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), CONFIRM_MS);
    };

    return (
        <Section
            label="Sources"
            count={view.sources.length}
            action={
                view.citations.length > 0 && (
                    <TextButton data-sp-cite data-sp-key="cite" onClick={() => void copy()}>
                        {copied ? 'Copied' : 'Copy citations'}
                    </TextButton>
                )
            }
        >
            <div className={styles.sources}>
                {view.sources.map((source) => (
                    <SourceRowButton key={source.key} source={source} />
                ))}
            </div>
        </Section>
    );
};

/** The panel's overview: the cards by question, `Keep in mind`, sources. */
export const Overview = (props: OverviewProps) => (
    <>
        <CardsSection {...props} />
        <KeepSection {...props} />
        <SourcesSection view={props.view} />
    </>
);
