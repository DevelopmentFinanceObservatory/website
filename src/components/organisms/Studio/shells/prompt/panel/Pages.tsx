import { useId, useState } from 'react';

import PlanModal from '../../../workspace/PlanModal';
import { usePromptShell } from '../shellContext';
import { usePanelNav } from './panelNav';
import { CardChip, Chips } from './parts/CardChip';
import { Chevron } from './parts/Glyphs';
import { Mark } from './parts/Mark';
import { PageShell, PageText } from './parts/PageShell';
import { Pairs } from './parts/Pairs';
import partStyles from './parts/parts.module.scss';
import { Section } from './parts/Section';
import { TextButton } from './parts/TextButton';
import { useConfirm } from './parts/useConfirm';
import { CardRowItem, ChangedLines, PlanLineButton } from './Rows';
import styles from './SessionPanel.module.scss';

import SourceLink from '@/components/atoms/SourceLink/SourceLink';
import type { PlanPage as PlanPageView, SourceRow, TurnPage } from '@/lib/studio/sessionView';
import { type Dataset } from '@/lib/studio/sessionView';

const plural = (count: number, one: string, many = `${one}s`) =>
    `${count} ${count === 1 ? one : many}`;

/** A question's page: its reply's first sentence, the data it used, its
 *  plan and its cards. */
export const QuestionPage = ({ page, newest }: { page: TurnPage; newest: boolean }) => {
    const { dispatch, focusField } = usePromptShell();
    const { show } = usePanelNav();
    const stageKey = `stage:${page.turn}:find`;

    return (
        <PageShell kind="turn" title={page.question} meta={page.words}>
            {page.reply && (
                <Section>
                    <PageText>{page.reply}</PageText>
                    <TextButton
                        data-sp-read
                        data-sp-key="read"
                        onClick={() => {
                            dispatch({
                                type: 'sheet.set',
                                sheet: newest ? 'open' : 'thread',
                                turn: page.turn,
                            });
                            // On an older question the conversation sheet
                            // moves focus to that question itself.
                            if (newest) focusField();
                        }}
                    >
                        Read it at the prompt
                    </TextButton>
                </Section>
            )}
            {(page.datasets > 0 ||
                page.plan ||
                page.cards.length > 0 ||
                page.changed.length > 0) && (
                <Section>
                    <ul className={styles.items}>
                        {page.datasets > 0 && (
                            <li>
                                <button
                                    type="button"
                                    className={styles.source}
                                    data-sp-stage="find"
                                    data-sp-key={stageKey}
                                    onClick={() =>
                                        show({ kind: 'stage', turn: page.turn }, stageKey)
                                    }
                                >
                                    <span className={styles.sourceTop}>
                                        <span className={styles.sourceName}>
                                            Data used
                                            <span className={partStyles.count}>
                                                {page.datasets}
                                            </span>
                                        </span>
                                        <Chevron direction="right" />
                                    </span>
                                </button>
                            </li>
                        )}
                        {page.plan && (
                            <li>
                                <PlanLineButton plan={page.plan} />
                            </li>
                        )}
                        {page.cards.map((row) => (
                            <CardRowItem key={row.id} row={row} />
                        ))}
                        <ChangedLines lines={page.changed} />
                    </ul>
                </Section>
            )}
        </PageShell>
    );
};

/** The datasets a question's cards drew. */
export const DataUsedPage = ({ datasets }: { datasets: Dataset[] }) => (
    <PageShell kind="stage" title="Data used" meta={plural(datasets.length, 'dataset')}>
        <Section label="Data source">
            <div className={styles.blocks}>
                {datasets.map((dataset) => (
                    <div
                        key={`${dataset.measure}|${dataset.source}|${dataset.years}`}
                        className={styles.block}
                    >
                        <span className={styles.blockMain}>{dataset.measure}</span>
                        {(dataset.source || dataset.years) && (
                            <span className={partStyles.mono}>
                                {[dataset.source, dataset.years].filter(Boolean).join(' · ')}
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </Section>
    </PageShell>
);

/** A question's plan: its steps and what each gave, its choices and
 *  caveats, and the full plan in a dialog. */
export const PlanPage = ({ page }: { page: PlanPageView }) => {
    const [open, setOpen] = useState(false);

    return (
        <PageShell kind="plan" title={page.title} meta={page.meta}>
            {page.summary && (
                <Section label="Summary">
                    <PageText>{page.summary}</PageText>
                </Section>
            )}
            <Section label="Steps" count={page.steps.length}>
                <ol className={styles.steps}>
                    {page.steps.map((step) => (
                        <li key={step.key} className={styles.step} data-state={step.state}>
                            <span className={styles.stepNumber}>{step.number}</span>
                            <Mark state={step.state} />
                            <span className={styles.stepBody}>
                                <span className={styles.stepLabel}>{step.label}</span>
                                {step.cards.length > 0 && (
                                    <Chips>
                                        {step.cards.map((card) => (
                                            <CardChip
                                                key={card.id}
                                                id={card.id}
                                                title={card.title}
                                            />
                                        ))}
                                    </Chips>
                                )}
                                {step.inReply && (
                                    <span className={partStyles.mono}>In the reply</span>
                                )}
                            </span>
                        </li>
                    ))}
                </ol>
            </Section>
            {page.choices.length > 0 && (
                <Section label="Counted as" count={page.choices.length}>
                    <Pairs rows={page.choices} />
                </Section>
            )}
            {page.caveats.length > 0 && (
                <Section label="Keep in mind" count={page.caveats.length}>
                    <ul className={styles.lines}>
                        {page.caveats.map((caveat) => (
                            <li key={caveat}>{caveat}</li>
                        ))}
                    </ul>
                </Section>
            )}
            {!page.live && (
                <Section foot>
                    <button
                        type="button"
                        className={styles.link}
                        aria-haspopup="dialog"
                        data-sp-planmodal
                        data-sp-key="planmodal"
                        onClick={() => setOpen(true)}
                    >
                        View full plan
                    </button>
                    <PlanModal view={page.view} open={open} onOpenChange={setOpen} />
                </Section>
            )}
        </PageShell>
    );
};

/** A source the canvas's cards use: its licence and freshness, the cards
 *  that use it, its page on this site and its citation. */
export const SourcePage = ({ source }: { source: SourceRow }) => {
    const { outcome, run } = useConfirm();
    const usedId = useId();

    const copy = () =>
        run(() => navigator.clipboard.writeText(source.citations.join('\n\n')), {
            done: 'Citation copied',
            failed: 'Citation not copied',
        });

    const rows = [
        { key: 'licence', label: 'Licence', value: source.licence },
        { key: 'refreshed', label: 'Last refreshed', value: source.lastRefreshed },
    ];
    const hasPairs = rows.some((row) => row.value);
    const linked = source.page || source.url;

    return (
        <PageShell kind="source" title={source.name}>
            {hasPairs && (
                <Section label="About">
                    <Pairs rows={rows} />
                </Section>
            )}
            {source.cards.length >= 2 && (
                <Section label="Used by" count={plural(source.cards.length, 'card')} id={usedId}>
                    <Chips>
                        {source.cards.map((card) => (
                            <CardChip key={card.id} id={card.id} title={card.title} />
                        ))}
                    </Chips>
                </Section>
            )}
            {(linked || source.citations.length > 0) && (
                <Section foot>
                    {source.page ? (
                        <SourceLink className={partStyles.textButton} dcid={source.page}>
                            Open the source page
                        </SourceLink>
                    ) : (
                        source.url && (
                            <a
                                className={partStyles.textButton}
                                href={source.url}
                                target="_blank"
                                rel="noreferrer"
                            >
                                Open the source page
                            </a>
                        )
                    )}
                    {source.citations.length > 0 && (
                        <TextButton
                            data-sp-key="copycite"
                            data-failed={outcome === 'failed' || undefined}
                            onClick={() => void copy()}
                        >
                            {outcome === 'done'
                                ? 'Copied'
                                : outcome === 'failed'
                                  ? 'Not copied'
                                  : 'Copy citation'}
                        </TextButton>
                    )}
                </Section>
            )}
        </PageShell>
    );
};
