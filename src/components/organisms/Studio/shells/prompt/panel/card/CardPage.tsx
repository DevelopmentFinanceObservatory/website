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
import PlacesPick from './PlacesPick';
import UnitPick from './UnitPick';
import YearsPick from './YearsPick';

import { cardImageName, cardNode, downloadCardImage } from '@/lib/studio/cardImage';
import {
    type ChangeOffer,
    changeOffers,
    changeQueued,
    type ChangeRowKey,
    changeStatus,
    type ChangeStatus,
    placesChange,
    placesChanged,
    placesText,
    windowChanged,
    yearsChange,
    yearsText,
} from '@/lib/studio/cardChange';
import { cardPageView, type CardPageView, type MeasureRow } from '@/lib/studio/cardPageView';
import { standingFor } from '@/lib/studio/cardIdentity';
import { replacedChain } from '@/lib/studio/cardReplace';
import { localDay } from '@/lib/studio/descriptionBlocks';
import { approvedPlans, type PlanLinks } from '@/lib/studio/planLink';
import type { Widget } from '@/lib/chat/widgets';
import { cardUnitChange } from '@/lib/studio/cardUnit';
import type { ApprovedPlan } from '@/lib/studio/plan';
import { ESCAPE_CARD_PAGE, ESCAPE_PICKER } from '@/lib/studio/promptShell';
import { servesUnit, unitChanged, unitText } from '@/lib/studio/unitChoice';
import type { PlaceOption, UnitChoice } from '@/lib/studio/wire';

// The reader's selection in an open picker, one shape per kind of change.
type Pick =
    | { kind: 'unit'; unit: UnitChoice }
    | { kind: 'years'; from: number; to: number }
    | { kind: 'shows'; places: PlaceOption[] };

// An open picker: the card and the offer it belongs to, and the selection.
type OpenPicker = { card: string; offer: string; pick: Pick };

// A change sent from this page, kept by offer until the card standing in its
// card's place is replaced by it, or it is refused, so the page can say
// which.
type Applied = {
    card: string;
    offer: string;
    key: ChangeRowKey;
    role?: string;
    label: string;
    text: string;
};

// A change row's kind in its usage event.
const changeKind = (key: ChangeRowKey) => (key === 'shows' ? 'places' : key);

// The selection a picker opens on: what the row holds now.
const startPick = (offer: ChangeOffer): Pick => {
    switch (offer.key) {
        case 'unit':
            return { kind: 'unit', unit: offer.current };
        case 'years':
            return { kind: 'years', from: offer.window.start_year, to: offer.window.end_year };
        case 'shows':
            return { kind: 'shows', places: offer.chosen };
    }
};

// Whether the selection differs from the row and is a change the send
// builds for card `widget` (cardUnitChange, yearsChange, placesChange).
const canApply = (
    widget: Widget & { turn: number },
    title: string,
    offer: ChangeOffer,
    pick: Pick,
): boolean => {
    if (offer.key === 'unit' && pick.kind === 'unit') {
        return (
            servesUnit(offer.offer, pick.unit) &&
            unitChanged(offer.current, pick.unit) &&
            cardUnitChange(widget, title, pick.unit) !== null
        );
    }

    if (offer.key === 'years' && pick.kind === 'years') {
        return (
            windowChanged(offer.window, pick.from, pick.to) &&
            yearsChange(widget, title, pick.from, pick.to) !== null
        );
    }

    return (
        offer.key === 'shows' &&
        pick.kind === 'shows' &&
        placesChanged(offer.chosen, pick.places) &&
        placesChange(widget, title, offer.role, pick.places) !== null
    );
};

// The selection in words, as the page announces a change that arrived.
const pickText = (offer: ChangeOffer, pick: Pick): string => {
    switch (pick.kind) {
        case 'unit':
            return offer.key === 'unit' ? unitText(offer.offer, pick.unit) : '';
        case 'years':
            return yearsText(pick.from, pick.to);
        case 'shows':
            return placesText(pick.places);
    }
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
 * The card page of the session panel: the title and where the card came
 * from, its actions, `What it measures` with a `Change` on each row the card
 * can change, `Set by the plan` for a plan card, `Keep in mind`, its sources,
 * `Cite as` and how it was made. The page follows the card when a
 * replacement takes its place, and gives way when the card leaves.
 */
const CardPage = ({ id }: { id: string }) => {
    const model = useStudioModel();
    const {
        dispatch,
        announce,
        focusField,
        panelOpen,
        plans: { planOf },
        report,
    } = usePromptShell();
    const { chat, canvas, doc, panels, modals } = model;
    const replacedIds = doc.replacedIds;
    const shownIds = useMemo(
        () => new Set(canvas.widgets.map((widget) => widget.id)),
        [canvas.widgets],
    );
    const current = standingFor(id, shownIds, replacedIds);
    // The cards the standing card took the place of, newest first.
    const replaced = useMemo(
        () => (current ? replacedChain(current, replacedIds).slice(1) : []),
        [current, replacedIds],
    );
    const widget = current ? chat.widgets.find((other) => other.id === current) : undefined;
    // A template string, which the compiler lint reads as a primitive. The
    // bare call reads as an object a later call could mutate, and the view's
    // memo then fails react-hooks/preserve-manual-memoization.
    const title = current ? `${canvas.titleOf(current)}` : '';

    const [picker, setPicker] = useState<OpenPicker | null>(null);
    const [download, setDownload] = useState<string | null>(null);
    const applied = useRef(new Map<string, Applied>());
    const pageRef = useRef<HTMLDivElement>(null);
    const pickerId = useId();
    // The line saying why a `Change` is held, which each blocked button names.
    const heldId = useId();
    const downloadId = useId();

    // The shell's plan links name each card's plan; the plan itself, for its
    // choices, is on the reply of the plan's turn.
    const approved = useMemo(
        () => approvedPlans(chat.messages, chat.activity),
        [chat.messages, chat.activity],
    );

    const offers = useMemo(() => (widget ? changeOffers(widget) : []), [widget]);
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
                          canShare: true,
                      },
                      messages: chat.messages,
                      activity: chat.activity,
                      plan: planFor(widget.id, planOf, approved),
                      offers,
                  })
                : null,
        [widget, title, citedId, chat.messages, chat.activity, planOf, approved, offers],
    );

    // Each offer's status, matched through the cards the standing card
    // replaced, so a change asked of one of them shows here.
    const statuses = useMemo(
        () =>
            new Map(
                offers.map((offer): [string, ChangeStatus] => [
                    offer.id,
                    current
                        ? changeStatus({
                              messages: chat.messages,
                              thinking: chat.thinking,
                              cardId: current,
                              key: offer.key,
                              ...(offer.key === 'shows' && { role: offer.role }),
                              replaced,
                              queued: chat.queued,
                              dropped: chat.dropped,
                          })
                        : { state: 'idle' },
                ]),
            ),
        [offers, current, replaced, chat.messages, chat.thinking, chat.queued, chat.dropped],
    );
    const statusOf = (offer: ChangeOffer): ChangeStatus =>
        statuses.get(offer.id) ?? { state: 'idle' };
    // One change at a time per card: while one is pending or queued, every
    // Change on the page waits, since the next would be built against a card
    // about to be replaced.
    const changing = [...statuses.values()].some((status) => status.state === 'pending');
    // A plan waiting on approval holds every Change (changesHeld).
    const held = chat.changesHeld;
    const blocked = changing || held !== null;

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

    const focusChange = (offerId: string) =>
        requestAnimationFrame(() =>
            pageRef.current
                ?.querySelector<HTMLElement>(`[data-sp-change="${CSS.escape(offerId)}"]`)
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

        const chain = replacedChain(current, replacedIds);

        if (!chain.includes(was)) return;

        // A change still queued was not what replaced the card: the queue
        // sends it to the replacement.
        const arrived = [...applied.current.values()].filter(
            (sent) =>
                chain.includes(sent.card) && !changeQueued(chat.queued, chain, sent.key, sent.role),
        );

        for (const sent of arrived) {
            applied.current.delete(sent.offer);
            announce(`${sent.label} changed to ${sent.text}`);
            focusChange(sent.offer);
        }

        if (arrived.length === 0 && picker?.card === was) {
            announce('The card was replaced, so its change picker closed.');
            focusChange(picker.offer);
        }
    }, [current, replacedIds, announce, picker, chat.queued]);

    // A refusal of a change this page sent, by the harness or by the queue.
    useEffect(() => {
        if (!current) return;

        for (const sent of [...applied.current.values()]) {
            const status = statuses.get(sent.offer);

            if (status?.state === 'refused' && [current, ...replaced].includes(sent.card)) {
                applied.current.delete(sent.offer);
                announce(status.detail);
                report('studio.change', {
                    step: 'refused',
                    kind: changeKind(sent.key),
                    // The queue's drop, else the harness's code when its
                    // refusal has one.
                    why: status.dropped ? 'queue' : (status.code ?? 'assistant'),
                });
            }
        }
    }, [statuses, current, replaced, announce, report]);

    // The picker belongs to the card it opened on, so it closes when a
    // replacement takes the card's place.
    const open = picker && picker.card === current ? picker : null;

    const closePicker = (offerId: string) => {
        setPicker(null);
        focusChange(offerId);
    };
    const reportCancel = (offerId: string) => {
        const offer = offers.find((other) => other.id === offerId);

        if (offer) report('studio.change', { step: 'cancel', kind: changeKind(offer.key) });
    };

    const downloadOpen = download !== null && download === current;

    // Escape closes the picker, then the download block, only while the
    // panel shows the page.
    useEscape(
        ESCAPE_PICKER,
        () => {
            if (!open) return false;

            closePicker(open.offer);
            reportCancel(open.offer);

            return true;
        },
        panelOpen && !!open,
    );

    useEscape(
        ESCAPE_CARD_PAGE,
        () => {
            if (!downloadOpen) return false;

            setDownload(null);
            pageRef.current?.querySelector<HTMLElement>('[data-sp-act="data"]')?.focus();

            return true;
        },
        panelOpen && downloadOpen,
    );

    if (!current || !widget || !view) return null;

    // A change the guest gate stops sends nothing and arms nothing; the
    // guest wall says why.
    const apply = (offer: ChangeOffer, label: string, pick: Pick) => {
        const went =
            pick.kind === 'unit'
                ? canvas.changeUnit(current, pick.unit)
                : pick.kind === 'years'
                  ? canvas.changeYears(current, pick.from, pick.to)
                  : offer.key === 'shows' && canvas.changePlaces(current, offer.role, pick.places);

        if (went) {
            report('studio.change', { step: 'apply', kind: changeKind(offer.key) });
            applied.current.set(offer.id, {
                card: current,
                offer: offer.id,
                key: offer.key,
                ...(offer.key === 'shows' && { role: offer.role }),
                label,
                text: pickText(offer, pick),
            });
        }

        closePicker(offer.id);
    };

    // The choices of an open picker, for its offer and selection.
    const pickBody = (offer: ChangeOffer, label: string, openOn: OpenPicker) => {
        const { pick } = openOn;
        const update = (next: Pick) => setPicker({ ...openOn, pick: next });

        if (offer.key === 'unit' && pick.kind === 'unit') {
            return (
                <UnitPick
                    offer={offer.offer}
                    unit={pick.unit}
                    onChange={(unit) => update({ kind: 'unit', unit })}
                />
            );
        }

        if (offer.key === 'years' && pick.kind === 'years') {
            return (
                <YearsPick
                    window={offer.window}
                    from={pick.from}
                    to={pick.to}
                    onChange={(from, to) => update({ kind: 'years', from, to })}
                />
            );
        }

        if (offer.key === 'shows' && pick.kind === 'shows') {
            return (
                <PlacesPick
                    componentId={
                        widget.kind === 'text' ? widget.id : (widget.ref?.component_id ?? widget.id)
                    }
                    role={offer.role}
                    label={label}
                    multiple={offer.multiple}
                    max={offer.max}
                    shown={offer.chosen}
                    picked={pick.places}
                    onChange={(places) => update({ kind: 'shows', places })}
                />
            );
        }

        return null;
    };

    const changeRow = (row: MeasureRow): PairRow => {
        const { offer } = row;

        if (!offer) {
            return { key: row.key, label: row.label, value: <RowValue row={row} /> };
        }

        const status = statusOf(offer);
        const pending = status.state === 'pending';
        const isOpen = open?.offer === offer.id;
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
                    data-sp-change={offer.id}
                    data-sp-key={`change:${offer.id}`}
                    aria-label={`Change ${label}`}
                    aria-expanded={isOpen}
                    aria-controls={isOpen ? pickerId : undefined}
                    aria-disabled={blocked || undefined}
                    aria-describedby={held !== null ? heldId : undefined}
                    onClick={() => {
                        if (blocked) {
                            report('studio.change', {
                                step: 'blocked',
                                kind: changeKind(offer.key),
                                // changesHeld reads the question before the plan.
                                why: held === null ? 'pending' : chat.clarify ? 'question' : 'plan',
                            });

                            return;
                        }

                        if (isOpen) {
                            closePicker(offer.id);
                            reportCancel(offer.id);

                            return;
                        }

                        setPicker({ card: current, offer: offer.id, pick: startPick(offer) });
                        report('studio.change', { step: 'open', kind: changeKind(offer.key) });
                    }}
                >
                    Change
                </button>
            ),
            below: isOpen ? (
                <ChangePicker
                    id={pickerId}
                    rowKey={offer.id}
                    label={label}
                    canApply={!held && canApply(widget, title, offer, open.pick)}
                    onApply={() => apply(offer, label, open.pick)}
                    onCancel={() => {
                        closePicker(offer.id);
                        reportCancel(offer.id);
                    }}
                >
                    {pickBody(offer, label, open)}
                </ChangePicker>
            ) : status.state === 'refused' ? (
                <p className={styles.refused} data-sp-change-note>
                    {status.detail}
                </p>
            ) : undefined,
        };
    };

    const measures = view.measures;
    const imageable = widget.kind !== 'text';

    return (
        <div ref={pageRef} className={styles.page}>
            <PageShell kind="card" title={view.title} meta={<Origin view={view} />}>
                <div className={styles.actions}>
                    <div className={styles.actionRow}>
                        <button
                            type="button"
                            className={styles.ask}
                            data-sp-ask
                            data-sp-key="ask"
                            onClick={() => {
                                canvas.askFollowUp(current, title);
                                focusField();
                            }}
                        >
                            Ask about this card
                        </button>
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
                        <IconAction
                            wide
                            icon="embed"
                            label="Embed"
                            subject={title}
                            data-sp-act="embed"
                            data-sp-key="act:embed"
                            onAction={() => modals.share.show({ kind: 'card', id: current, title })}
                        />
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
                            <b>{view.measure.label}</b>
                            {view.measure.definition && <>. {view.measure.definition}</>}
                        </PageText>
                    )}
                    {view.live && <PageText>{view.live}</PageText>}
                    <Pairs rows={measures.map(changeRow)} className={styles.measures} />
                    {held && measures.some((row) => row.offer) && (
                        <PageText id={heldId}>{held}</PageText>
                    )}
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
