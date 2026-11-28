import classNames from 'classnames';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { useStudioModel } from '../../../../hooks/studioContext';
import CardDownload from '../../../../modals/CardDownload';
import { useEscape, usePromptShell } from '../../shellContext';
import { usePanelNav } from '../panelNav';
import { CardChip, Chips } from '../parts/CardChip';
import { Chevron } from '../parts/Glyphs';
import { IconAction } from '../parts/IconAction';
import { PageShell, PageText } from '../parts/PageShell';
import { type PairRow, Pairs } from '../parts/Pairs';
import { Section } from '../parts/Section';
import styles from './CardPage.module.scss';
import {
    CiteSection,
    IndicatorsSection,
    KeepSection,
    MadeSection,
    snapshotUrl,
    SourcesSection,
} from './CardSections';
import ChangePicker from './ChangePicker';
import UnitPick from './UnitPick';

import { cardImageName, cardNode, downloadCardImage } from '@/lib/studio/cardImage';
import {
    type ChangeOffer,
    type ChangeRowKey,
    changeOffers,
    changeStatus,
    type ChangeStatus,
} from '@/lib/studio/cardChange';
import {
    cardPageView,
    type CardPageView,
    currentCardId,
    type MeasureRow,
    replacedChain,
} from '@/lib/studio/cardPageView';
import { localDay } from '@/lib/studio/descriptionBlocks';
import { approvedPlans, type PlanLinks } from '@/lib/studio/planLink';
import type { ApprovedPlan } from '@/lib/studio/plan';
import { ESCAPE_CARD_PAGE, ESCAPE_PICKER } from '@/lib/studio/promptShell';
import { servesUnit, unitChanged, unitText } from '@/lib/studio/unitChoice';
import type { UnitChoice } from '@/lib/studio/wire';

// An open picker: the card and row it belongs to, and the reader's selection.
type OpenPicker = { card: string; key: ChangeRowKey; unit: UnitChoice };

// A change sent from this page, kept until its card is replaced or the
// harness refuses it, so the page can say which.
type Applied = { card: string; key: ChangeRowKey; label: string; text: string };

const ROW_LABEL: Record<ChangeRowKey, string> = {
    unit: 'Unit',
    years: 'Years',
    shows: 'Shows',
    split: 'Split by',
};

// The measure rows with each offer on the row it changes. An offer whose row
// the card's facts do not show gets a row of its own, in the offer's words.
const rowsWithOffers = (
    rows: MeasureRow[],
    offers: ChangeOffer[],
): (MeasureRow & { offer: ChangeOffer | null })[] => {
    const withOffer = rows.map((row) => ({
        ...row,
        offer: offers.find((offer) => offer.key === row.key) ?? null,
    }));
    const missing = offers
        .filter((offer) => !rows.some((row) => row.key === offer.key))
        .map((offer) => ({
            key: offer.key,
            label: ROW_LABEL[offer.key],
            value: unitText(offer.offer, offer.current),
            terms: null,
            offer,
        }));

    return [...withOffer, ...missing];
};

// The approved plan a card belongs to, with the plan itself.
const planFor = (id: string, planOf: PlanLinks['planOf'], plans: Record<number, ApprovedPlan>) => {
    const link = planOf(id);
    const approved = link ? plans[link.turn] : undefined;

    return link && approved ? { link, approved } : null;
};

/** The origin block: the plan the card came from, else its question, then
 *  each change made to the card since. */
const Origin = ({ view }: { view: CardPageView }) => {
    const { show } = usePanelNav();
    const { origin } = view;

    if (!origin && view.changedFor.length === 0) return null;

    return (
        <div className={styles.origin}>
            {origin && (
                <button
                    type="button"
                    className={styles.originButton}
                    data-sp-origin={origin.kind}
                    data-sp-key={`origin:${origin.kind}`}
                    onClick={() =>
                        show({ kind: origin.kind, turn: origin.turn }, `origin:${origin.kind}`)
                    }
                >
                    <span className={styles.originLabel}>
                        {origin.kind === 'plan' ? 'From the plan:' : 'Made for:'}
                    </span>
                    <span className={styles.originText}>
                        {origin.kind === 'plan' ? origin.title : origin.question}
                    </span>
                    <Chevron direction="right" />
                </button>
            )}
            {view.changedFor.map((text, index) => (
                <p key={`${text}#${index}`} className={styles.changed}>
                    <span className={styles.originLabel}>Changed for:</span> {text}
                </p>
            ))}
        </div>
    );
};

/** A row's value: plain words, or the named values it lists. */
const RowValue = ({ row }: { row: MeasureRow }) =>
    row.terms ? (
        <span className={styles.value}>
            {row.terms.map((term, index) => (
                <span key={term.key} title={term.definition ?? undefined}>
                    {term.name}
                    {index < (row.terms?.length ?? 0) - 1 && ', '}
                </span>
            ))}
        </span>
    ) : (
        <span className={styles.value}>{row.value}</span>
    );

/**
 * The card page of the session panel (spec section 5.5): the title and where
 * the card came from, its actions, `What it measures` with a `Change` on each
 * row the card can change, `Set by the plan` for a plan card, `Keep in mind`,
 * its sources, `Cite as` and how it was made. The page follows the card when
 * a replacement takes its place, and gives way when the card leaves.
 */
const CardPage = ({ id }: { id: string }) => {
    const model = useStudioModel();
    const {
        dispatch,
        announce,
        plans: { planOf },
    } = usePromptShell();
    const { chat, canvas, doc, panels, modals, readOnly, drafts } = model;
    const replacedIds = doc.replacedIds;
    const shownIds = useMemo(
        () => new Set(canvas.widgets.map((widget) => widget.id)),
        [canvas.widgets],
    );
    const current = currentCardId(id, shownIds, replacedIds);
    const widget = current ? chat.widgets.find((other) => other.id === current) : undefined;
    // A template string, which the compiler lint reads as a primitive. The
    // bare call reads as an object a later call could mutate, and the view's
    // memo then fails react-hooks/preserve-manual-memoization.
    const title = current ? `${canvas.titleOf(current)}` : '';

    const [picker, setPicker] = useState<OpenPicker | null>(null);
    const [download, setDownload] = useState<string | null>(null);
    const applied = useRef<Applied | null>(null);
    const pageRef = useRef<HTMLDivElement>(null);
    const pickerId = useId();
    const downloadId = useId();

    // The shell's plan links name each card's plan; the plan itself, for its
    // choices, is on the reply of the plan's turn.
    const approved = useMemo(
        () => approvedPlans(chat.messages, chat.activity),
        [chat.messages, chat.activity],
    );

    const citedId = typeof panels.infoCiteLink === 'object' ? panels.infoCiteLink.id : undefined;
    const view = useMemo(
        () =>
            widget
                ? cardPageView({
                      widget,
                      title,
                      options: {
                          retrievedOn: localDay(new Date()),
                          snapshotUrl: snapshotUrl(citedId),
                          canShare: !readOnly,
                      },
                      messages: chat.messages,
                      activity: chat.activity,
                      replaced: replacedChain(widget.id, replacedIds),
                      plan: planFor(widget.id, planOf, approved),
                  })
                : null,
        [
            widget,
            title,
            citedId,
            readOnly,
            chat.messages,
            chat.activity,
            replacedIds,
            planOf,
            approved,
        ],
    );

    const offers = useMemo(
        () => (widget && !readOnly ? changeOffers(widget) : []),
        [widget, readOnly],
    );
    const statusOf = (key: ChangeRowKey): ChangeStatus =>
        current
            ? changeStatus({
                  messages: chat.messages,
                  thinking: chat.thinking,
                  cardId: current,
                  key,
                  queued: chat.queued,
              })
            : { state: 'idle' };

    // The model's cite-link state follows the card More Info names. The
    // Prompt layout draws no More Info, so the card page names its card.
    const setInfoCardId = panels.setInfoCardId;

    useEffect(() => {
        if (!current) return;

        setInfoCardId(current);

        return () => setInfoCardId(null);
    }, [current, setInfoCardId]);

    // The trail names the card the page opened on; a replacement takes its
    // place there too.
    useEffect(() => {
        if (current && current !== id) {
            dispatch({ type: 'panel.replace', page: { kind: 'card', id: current } });
        }
    }, [current, id, dispatch]);

    const focusChange = (key: ChangeRowKey) =>
        requestAnimationFrame(() =>
            pageRef.current
                ?.querySelector<HTMLElement>(`[data-sp-change="${key}"]`)
                ?.focus({ preventScroll: true }),
        );

    // A replacement of the card: the change this page sent arrived, or the
    // card changed underneath an open picker, which closes (it reads the old
    // card) and says why.
    const seen = useRef(current);

    useEffect(() => {
        const was = seen.current;

        seen.current = current;

        if (!was || !current || was === current) return;
        if (!replacedChain(current, replacedIds).includes(was)) return;

        const sent = applied.current;

        if (sent && sent.card === was) {
            applied.current = null;
            announce(`${sent.label} changed to ${sent.text}`);
            focusChange(sent.key);
        } else if (picker?.card === was) {
            announce('The card was replaced, so its change picker closed.');
            focusChange(picker.key);
        }
    }, [current, replacedIds, announce, picker]);

    // A refusal of the change this page sent.
    const unitStatus = statusOf('unit');
    const refusal = unitStatus.state === 'refused' ? unitStatus.detail : null;

    useEffect(() => {
        const sent = applied.current;

        if (refusal && sent && sent.card === current) {
            applied.current = null;
            announce(refusal);
        }
    }, [refusal, current, announce]);

    // The picker belongs to the card it opened on, so it closes when a
    // replacement takes the card's place.
    const open = picker && picker.card === current ? picker : null;

    const closePicker = (key: ChangeRowKey) => {
        setPicker(null);
        focusChange(key);
    };

    useEscape(ESCAPE_PICKER, () => {
        if (!open) return false;

        closePicker(open.key);

        return true;
    });

    const downloadOpen = download !== null && download === current;

    useEscape(ESCAPE_CARD_PAGE, () => {
        if (!downloadOpen) return false;

        setDownload(null);
        pageRef.current?.querySelector<HTMLElement>('[data-sp-act="data"]')?.focus();

        return true;
    });

    if (!current || !widget || !view) return null;

    const apply = (offer: ChangeOffer, unit: UnitChoice) => {
        applied.current = {
            card: current,
            key: offer.key,
            label: ROW_LABEL[offer.key],
            text: unitText(offer.offer, unit),
        };
        canvas.changeUnit(current, unit);
        closePicker(offer.key);
    };

    const changeRow = (row: MeasureRow & { offer: ChangeOffer | null }): PairRow => {
        const { offer } = row;

        if (!offer) {
            return { key: row.key, label: row.label, value: <RowValue row={row} /> };
        }

        const status = statusOf(offer.key);
        const pending = status.state === 'pending';
        const isOpen = open?.key === offer.key;
        const label = row.label;

        return {
            key: row.key,
            label,
            value: (
                <>
                    <RowValue row={row} />
                    {pending && (
                        <span className={styles.pending}>
                            <span className={styles.spin} aria-hidden="true" />
                            Changing
                        </span>
                    )}
                </>
            ),
            action: (
                <button
                    type="button"
                    className={classNames(styles.change, isOpen && styles.changeOpen)}
                    data-sp-change={offer.key}
                    data-sp-key={`change:${offer.key}`}
                    aria-label={`Change ${label}`}
                    aria-expanded={isOpen}
                    aria-controls={isOpen ? pickerId : undefined}
                    aria-disabled={pending || undefined}
                    onClick={() => {
                        if (pending) return;
                        if (isOpen) {
                            closePicker(offer.key);

                            return;
                        }

                        setPicker({ card: current, key: offer.key, unit: offer.current });
                    }}
                >
                    Change
                </button>
            ),
            below: isOpen ? (
                <ChangePicker
                    id={pickerId}
                    rowKey={offer.key}
                    label={label}
                    canApply={
                        servesUnit(offer.offer, open.unit) && unitChanged(offer.current, open.unit)
                    }
                    onApply={() => apply(offer, open.unit)}
                    onCancel={() => closePicker(offer.key)}
                >
                    <UnitPick
                        offer={offer.offer}
                        unit={open.unit}
                        onChange={(unit) => setPicker({ ...open, unit })}
                    />
                </ChangePicker>
            ) : status.state === 'refused' ? (
                <p className={styles.refused} data-sp-change-note>
                    {status.detail}
                </p>
            ) : undefined,
        };
    };

    const measures = rowsWithOffers(view.measures, offers);
    const imageable = widget.kind !== 'text';

    return (
        <div ref={pageRef} className={styles.page}>
            <PageShell kind="card" title={view.title} meta={<Origin view={view} />}>
                <div className={styles.actions}>
                    <div className={styles.actionRow}>
                        {!readOnly && (
                            <button
                                type="button"
                                className={styles.ask}
                                data-sp-ask
                                data-sp-key="ask"
                                onClick={() => {
                                    canvas.askFollowUp(current, title);
                                    drafts.inputRef.current?.focus();
                                }}
                            >
                                Ask about this card
                            </button>
                        )}
                        <IconAction
                            wide
                            icon="download"
                            label="Download data"
                            subject={title}
                            data-sp-act="data"
                            data-sp-key="act:data"
                            aria-expanded={downloadOpen}
                            aria-controls={downloadOpen ? downloadId : undefined}
                            onAction={() => setDownload(downloadOpen ? null : current)}
                        />
                        {imageable && (
                            <IconAction
                                wide
                                icon="download"
                                label="Download image"
                                doneLabel="Image downloaded"
                                subject={title}
                                data-sp-act="image"
                                data-sp-key="act:image"
                                onAction={async () => {
                                    const node = cardNode(current);

                                    if (!node) return false;

                                    await downloadCardImage(node, cardImageName(title));
                                }}
                            />
                        )}
                        {!readOnly && (
                            <IconAction
                                wide
                                icon="embed"
                                label="Embed"
                                subject={title}
                                data-sp-act="embed"
                                data-sp-key="act:embed"
                                onAction={() =>
                                    modals.share.show({ kind: 'card', id: current, title })
                                }
                            />
                        )}
                    </div>
                    {downloadOpen && (
                        <div id={downloadId} className={styles.download}>
                            <CardDownload widget={widget} />
                        </div>
                    )}
                </div>

                <Section label="What it measures" data-sp-sec="c-what">
                    {view.calculation && (
                        <PageText>
                            Calculated as {view.calculation.numerator} divided by{' '}
                            {view.calculation.denominator}
                        </PageText>
                    )}
                    {view.measure && (
                        <PageText>
                            <b>{view.measure.label}</b>. {view.measure.definition}
                        </PageText>
                    )}
                    {view.live && <PageText>{view.live}</PageText>}
                    <Pairs rows={measures.map(changeRow)} className={styles.measures} />
                    {view.leftOut.length > 0 && (
                        <>
                            <p className={styles.subLabel}>Left out</p>
                            <ul className={styles.notes}>
                                {view.leftOut.map((note) => (
                                    <li key={note}>{note}</li>
                                ))}
                            </ul>
                        </>
                    )}
                </Section>

                {view.plan && (
                    <Section label="Set by the plan" data-sp-sec="c-plan">
                        <Pairs
                            rows={view.plan.rows.map((row) => ({
                                key: row.key,
                                label: row.label,
                                value: <span className={styles.value}>{row.value}</span>,
                            }))}
                            className={styles.measures}
                        />
                        {view.plan.others.length > 0 && (
                            <>
                                <p className={styles.subLabel}>Also from this plan</p>
                                <Chips>
                                    {view.plan.others.map((other) => (
                                        <CardChip
                                            key={other}
                                            id={other}
                                            title={canvas.titleOf(other)}
                                        />
                                    ))}
                                </Chips>
                            </>
                        )}
                    </Section>
                )}

                <KeepSection notes={view.keep} />
                <SourcesSection view={view} />
                {view.cite && (
                    <CiteSection
                        cite={view.cite}
                        link={panels.infoCiteLink}
                        onAddLink={panels.citeInfoCard}
                    />
                )}
                <IndicatorsSection indicators={view.indicators} />
                {view.made && <MadeSection made={view.made} />}
            </PageShell>
        </div>
    );
};

export default CardPage;
