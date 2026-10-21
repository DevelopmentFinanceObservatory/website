/* eslint-disable @typescript-eslint/no-explicit-any -- takes specs, slots and options of either picker shape as `any` and reads only the members it renders, tolerating any that is missing */
'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import classNames from 'classnames';
import {
    Fragment,
    useId,
    useState,
    type Dispatch,
    type ReactNode,
    type SetStateAction,
} from 'react';

import styles from './DataSearch.module.scss';
import DepartureList, { type DepartureItem } from './DepartureList';
import { PhraseEditor, PlaceEditor, PlaceScopeEditor, WindowEditor } from './editors';
import {
    AnySelectionRow,
    LevelHint,
    menuEntryFocusRef,
    MultiSelectApplyButton,
    NoFilterMatch,
    onMenuContentKeyDownCapture,
    OptionFilterBar,
    OptionFilterInput,
    OptionRow,
    OptionSubmenu,
    SlotMenu,
    slotAriaLabel,
    UnresolvedToken,
    useToggleSelection,
} from './SlotMenu';
import { GraphInfo, MeasureInfo, SourceInfo } from './GraphInfo';
import { TokenAbout } from './TokenAbout';
import { UnitPicker } from './UnitPicker';
import WhyPanel from './WhyPanel';

import Button from '@/components/atoms/Button/Button';
import { capitalise } from '@/lib/capitalise';
import {
    answerDepartures,
    assumptionClauses,
    isClosestMatch,
    refsStatedBesides,
    sentenceBlocks,
    statingTokenIndex,
    tokenStates,
    type DepartureAction,
} from '@/lib/search/departures';
import { awaitingEntityOptions, awaitingSlotOptions } from '@/lib/search/menuState';
import { operationButtonLabel } from '@/lib/search/operations';
import {
    entityOptionDcid,
    filterOptionsByQuery,
    optionCoverageRankingBlocked,
    shouldShowOptionFilter,
} from '@/lib/search/pickerState';
import { spliceSentence } from '@/lib/search/refine';
import { keyRef } from '@/lib/search/searchClient';
import { planCoverageText, planSentenceText, tokenPart } from '@/lib/search/sentencePlan';
import {
    type EntityRoleKey,
    type GraphRef,
    type HydratedPart,
    type IdentityFacetAxis,
    type IdentityFacetBinding,
    isKnownPart,
    knownPart,
    type MeasureAxisValue,
    type NoDataOption,
    type ParsedPart,
    type RoleAxis,
    type SentenceToken,
    type SpecAlternativeMeasure,
} from '@/lib/search/types';
import type { WindowApplyValue } from '@/lib/search/windowState';
import {
    measureAlternatives,
    measureMenuRefs,
    measureDefinitionValues,
    measureSlotGroups,
    relatedMeasures,
    unitSwitches,
    type MeasurePick,
    type UnitSwitch,
} from '@/lib/search/measureMenu';
import {
    entityChoiceGroups,
    entityChoicePart,
    offersAmbiguousPicker,
    resolveTypedEdit,
} from '@/lib/search/parsedEdit';
import { collapsedCandidatesNote } from '@/lib/search/resultNotes';
import { foldReadings } from '@/lib/search/readings';
import {
    refineItemName,
    refineItems,
    refineKey,
    type RefineItem,
    type RefinePart,
} from '@/lib/search/refineMenu';
import { singleStatVarSpec, tokenAbout } from '@/lib/search/tokenAbout';
import { sharedOffer, unitConversion } from '@/lib/search/unitPicker';
import {
    ambiguousEntityMenuTitle,
    ambiguousWordingGroup,
    anchorDcid,
    bindsMethod,
    currentEntityDcids,
    entityOptionsEntry,
    entitySlotBindingForRefs,
    isLevelScopedOptions,
    methodPicker,
    optionCoverageLabel,
    optionLabel,
    optionMuted,
    levelMenu,
    placeEditorPickRoute,
    placeOptionsForSpec,
    slotOptionLabel,
    slotOptionsEntry,
    rankOptionsByCoverage,
    rowsLabel,
    slotOffersChoice,
    sourceOptionLabel,
    sourceOrigin,
    sourceSlotOptions,
    splitCurrentPick,
    sharedDirectionalEditRoute,
    sharedMethodPicker,
    sharedEntityOptions,
    unresolvedPartText,
} from '@/lib/search/view';
import type {
    EntityOptionsBySpec,
    MethodChoice,
    MethodPicker,
    PlaceOptionsBySpec,
    RootGroup,
    SlotOptionsEntry,
    SourceSlotOption,
} from '@/lib/search/view';

import type { SharedEdit } from './useSearchRun';

/** The values each row of a measure or unit menu defines through its info
 *  mark: the current measure's first, then each alternative's, each row
 *  keeping only the values no other row shares (measureDefinitionValues). */
const menuRowValues = (
    spec: { measure_axis_values?: MeasureAxisValue[] | null },
    alternatives: readonly SpecAlternativeMeasure[],
): GraphRef[][] => {
    const rows = [
        spec.measure_axis_values,
        ...alternatives.map((alternative) => alternative.measure_axis_values),
    ];

    return rows.map((row, at) =>
        measureDefinitionValues(
            row,
            rows.filter((_, other) => other !== at),
        ),
    );
};

// The definite parts Refine reads.
const refineParts = (parts: HydratedPart[]): RefinePart[] =>
    parts.flatMap((part) =>
        part.part?.status === 'definite' && part.hydratedSpec
            ? [{ index: part.index, variableText: part.variableText, spec: part.hydratedSpec }]
            : [],
    );

/** What Refine offers: the bindings no visible token states. DataSearch
 *  computes it once and hands the same list to the heading (whose
 *  departures open Refine at an entry) and the body (whose Refine button
 *  lists it), so a departure names only entries the menu has. */
export const answerRefineItems = ({
    response,
    parts,
    optionsBySpec,
    entityOptionsBySpec,
}: Pick<
    SearchSentenceProps,
    'response' | 'parts' | 'optionsBySpec' | 'entityOptionsBySpec'
>): RefineItem[] =>
    response
        ? refineItems({
              parts: refineParts(parts),
              plan: foldReadings(
                  response.sentence_plan ?? [],
                  parts.map((part) => part.part),
              ),
              partCount: parts.length,
              optionsBySpec,
              entityOptionsBySpec,
          })
        : [];

// An option's info icon, when the option names a graph node.
const optionInfo = (option: any) => {
    const dcid = option?.value?.ref?.ref;

    return dcid ? <GraphInfo dcid={dcid} /> : undefined;
};

// The measurement-method rows (`methodPicker`), for the byline's method
// token and Refine's method entry. A pick posts its binding; the checked
// row posts nothing.
const MethodChoices = ({
    picker,
    onPick,
}: {
    picker: MethodPicker;
    onPick: (binding: MethodChoice['binding']) => void;
}) => {
    const checkedCount = picker.choices.filter((choice) => choice.checked).length;

    return picker.choices.map((choice) => (
        <DropdownMenu.Item
            key={choice.key}
            asChild
            onSelect={() => {
                if (!choice.checked) onPick(choice.binding);
            }}
        >
            <OptionRow checked={choice.checked} current={choice.checked && checkedCount === 1}>
                {choice.label}
            </OptionRow>
        </DropdownMenu.Item>
    ));
};

/**
 * A level-scoped constraint slot's menu body (SlotOption.relation
 * populated, see isLevelScopedOptions), shaped by the slot's binding (see
 * levelMenu). Unbound, it lists the roots, and a root the wire sent
 * children for opens a submenu: the root itself first, then its children.
 * Bound, it lists the bound value's one way up, the bound value itself as
 * the current pick, its ways down, and the other roots beside a bound root
 * or a flat code system's value. A binding the server does not hold gets
 * the unbound menu, so its children stay reachable in their roots'
 * submenus. Rows keep the server's order and show its row count.
 * `onSelect` re-resolves through the same slot-edit door every other option
 * in this file uses, and a child pick comes back on the next response
 * already scoped to its own level.
 */
const renderLevelOptions = (slot: any, options: any[], onSelect: (binding: any) => void) => {
    const optionItem = (option: any, direction?: 'up' | 'down') => (
        <DropdownMenu.Item
            key={option?.value?.ref?.ref ?? optionLabel(option)}
            asChild
            onSelect={() => onSelect({ kind: 'value', value: option.value })}
        >
            <OptionRow
                direction={direction}
                meta={rowsLabel(option.served_rows, option.served_rows_exact)}
                info={optionInfo(option)}
            >
                {optionLabel(option)}
            </OptionRow>
        </DropdownMenu.Item>
    );
    const rootItems = (groups: RootGroup[]) =>
        groups.map(({ root, children }) =>
            children.length === 0 ? (
                optionItem(root)
            ) : (
                <OptionSubmenu
                    key={root?.value?.ref?.ref ?? optionLabel(root)}
                    label={optionLabel(root)}
                    meta={rowsLabel(root.served_rows, root.served_rows_exact)}
                >
                    {optionItem(root)}
                    {children.map((child) => optionItem(child))}
                </OptionSubmenu>
            ),
        );
    const menu = levelMenu(slot.binding, options);

    if (menu.kind === 'unbound') return rootItems(menu.groups);

    const { up, current, down, sideways } = menu;

    return (
        <>
            {up && optionItem(up, 'up')}
            <DropdownMenu.Item asChild onSelect={() => onSelect({ kind: 'unbound' })}>
                <OptionRow
                    checked
                    pinned
                    meta={rowsLabel(current.served_rows, current.served_rows_exact)}
                    info={optionInfo(current)}
                >
                    {optionLabel(current)}
                </OptionRow>
            </DropdownMenu.Item>
            {down.map((option) => optionItem(option, 'down'))}
            {rootItems(sideways)}
            {down.length === 0 && sideways.length === 0 && (
                <LevelHint>most specific level</LevelHint>
            )}
        </>
    );
};

/**
 * Decides internally between the level-scoped shape (parent/current/
 * children, with hierarchy) and a flat list (checked state), both showing
 * each option's row count, and ends with a hint when the slot's own
 * option set was truncated server-side. The wire sends a boolean and no
 * total, so the hint never implies a count. Each option carries the
 * graph's definition behind an info icon.
 */
const renderOptionMenu = (slot: any, entry: SlotOptionsEntry, onSelect: (binding: any) => void) => {
    const { options, truncated } = entry;

    return (
        <>
            {isLevelScopedOptions(options) ? (
                renderLevelOptions(slot, options, onSelect)
            ) : (
                <FlatOptionList slot={slot} options={options} onSelect={onSelect} />
            )}
            {truncated && <LevelHint>more options than shown</LevelHint>}
        </>
    );
};

/**
 * Split out so it can hold its own filter-text state. A helper invoked
 * directly (not JSX) can't call hooks. Rows keep the server's order.
 */
const FlatOptionList = ({
    slot,
    options,
    onSelect,
}: {
    slot: any;
    options: any[];
    onSelect: (binding: any) => void;
}) => {
    const [filter, setFilter] = useState('');
    const boundDcid = slot.binding?.value?.ref?.ref;
    const { current, rest } = splitCurrentPick(options, boundDcid);
    const showFilter = shouldShowOptionFilter(rest.length);
    const shown = showFilter
        ? filterOptionsByQuery(rest, filter, (option) => slotOptionLabel(slot, option))
        : rest;

    return (
        <>
            {showFilter && (
                <OptionFilterBar count={{ shown: shown.length, total: rest.length }}>
                    <OptionFilterInput
                        value={filter}
                        onChange={setFilter}
                        label="Filter listed options"
                    />
                </OptionFilterBar>
            )}
            {current && (
                <DropdownMenu.Item asChild onSelect={() => onSelect({ kind: 'unbound' })}>
                    <OptionRow
                        checked
                        pinned
                        meta={rowsLabel(current.served_rows, current.served_rows_exact)}
                        info={optionInfo(current)}
                    >
                        {slotOptionLabel(slot, current)}
                    </OptionRow>
                </DropdownMenu.Item>
            )}
            {shown.map((option: any) => {
                const dcid = option?.value?.ref?.ref;
                const label = slotOptionLabel(slot, option);

                return (
                    <DropdownMenu.Item
                        key={dcid ?? label}
                        asChild
                        onSelect={() => onSelect({ kind: 'value', value: option.value })}
                    >
                        <OptionRow
                            meta={rowsLabel(option.served_rows, option.served_rows_exact)}
                            info={optionInfo(option)}
                        >
                            {label}
                        </OptionRow>
                    </DropdownMenu.Item>
                );
            })}
            {shown.length === 0 && rest.length > 0 && <NoFilterMatch />}
        </>
    );
};

type SearchSentenceProps = {
    response: any;
    // Every part, in query order — the token routing target for a
    // part-indexed slot, and the source of the definite/candidates/no_data/
    // unsupported status a marked phrase reads.
    parts: HydratedPart[];
    optionsBySpec: Record<string, Record<string, SlotOptionsEntry>>;
    // spec_id-keyed directional entity options, for part-indexed and shared
    // origin/destination token menus.
    entityOptionsBySpec: EntityOptionsBySpec;
    // spec_id + scope-keyed prefetched observationAbout place candidates
    // (trailing place_options events); PlaceEditor reads these first and
    // only fetches the scopes they don't cover.
    placeOptionsBySpec: PlaceOptionsBySpec;
    // useSearchRun's own run-level `phase === 'loading'`: whether the BASE
    // run's resolve stream (not any one part's phase, and never an edit
    // post) may still deliver a trailing place_options event. Threaded
    // straight to every PlaceEditor as `baseStreamOpen` — see that prop's
    // own doc in editors.tsx for why a part-level phase read would stall
    // a click during an edit post for nothing.
    baseStreamOpen: boolean;
    onEditSlot: (
        partIndex: number,
        spec: any,
        slotIndex: number,
        binding: any,
        entityRole?: EntityRoleKey,
    ) => void;
    onEditEntity: (partIndex: number, spec: any, role: RoleAxis, dcids: string[] | null) => void;
    onEditWindow: (partIndex: number, spec: any, window: WindowApplyValue) => void;
    // An alternative measure, or a related one from the variable's group,
    // on each part a pick switches (several for a shared unit token).
    onEditMeasure: (picks: readonly MeasurePick[]) => void;
    // A facet axis bound or dropped on one part (the unit's currency and
    // price basis).
    onEditFacet: <A extends IdentityFacetAxis>(
        partIndex: number,
        spec: any,
        axis: A,
        binding: IdentityFacetBinding[A] | null,
    ) => void;
    // A typed phrase edit or entity_ambiguous pick's edited ParsedPart,
    // posted as a parsed entry re-resolving just this part.
    onEditParsed: (partIndex: number, part: ParsedPart) => void;
    // A hoisted where/when/source/origin token's edit: fans out to every
    // definite part through its own resubmit (useSearchRun.editShared).
    onEditShared: (edit: SharedEdit) => void;
    // Free-text refinement: re-runs the whole spliced sentence as raw text.
    onRefine: (query: string) => void;
    onStartNew: () => void;
};

// SearchSentenceHeading (the answer block: the closest-match lead, the
// editable <h1>, the byline and the departures) and SearchSentenceBody
// (everything below it: notes, errors, actions, the why-accordion) are two
// components, not one, so DataSearch.tsx can mount the heading at one stable
// position spanning the whole loading→done transition while the rest of the
// hero swaps in underneath it. The heading renders the same element shape
// before and after the response, its <h1> always in the same place, so the
// <h1>'s entrance animation never replays. See DataSearch.tsx's hero block.
type SearchSentenceHeadingProps = Pick<
    SearchSentenceProps,
    | 'response'
    | 'parts'
    | 'optionsBySpec'
    | 'entityOptionsBySpec'
    | 'placeOptionsBySpec'
    | 'baseStreamOpen'
    | 'onEditSlot'
    | 'onEditEntity'
    | 'onEditWindow'
    | 'onEditMeasure'
    | 'onEditFacet'
    | 'onEditParsed'
    | 'onEditShared'
    | 'onRefine'
> & {
    // What the <h1> shows before the response lands: the query, or the
    // early heading's tokens.
    fallback: ReactNode;
    // A departure's Studio action (operation_not_applied).
    onStudio: () => void;
    // What Refine offers (answerRefineItems), and a departure's way to open
    // it at one of those entries.
    refine: RefineItem[];
    onRefineOpen: (open: RefineOpen) => void;
    // The early, pre-response heading's own rendered token text (see
    // lib/search/sentencePlan.ts's earlySentenceTokens), trimmed and
    // deduped. A resolved token whose text isn't among them is new since
    // the early heading (an empty placeholder filled in, most often) and
    // fades in instead of appearing with the rest of this swap. Absent
    // when there was no early heading to compare against (a part that never
    // reached bind), in which case nothing fades in specially.
    newTokenTexts?: ReadonlySet<string>;
};

type SearchSentenceBodyProps = Pick<
    SearchSentenceProps,
    'parts' | 'optionsBySpec' | 'onEditSlot' | 'onEditEntity' | 'onEditFacet' | 'onStartNew'
> & {
    // What Refine offers (answerRefineItems), the same list the heading's
    // departures open.
    refine: RefineItem[];
    // A stream that may still deliver slot or entity options, so an empty
    // Refine may yet fill.
    optionsPending: boolean;
    refineOpen: RefineOpen | null;
    onRefineOpenChange: Dispatch<SetStateAction<RefineOpen | null>>;
};

/** Refine open, at the entry `at` names (`refineKey`) or at its top. */
export type RefineOpen = { at: string | null };

const openEntityLabel = (role: RoleAxis): string =>
    role === 'origin' ? 'any provider' : 'any recipient';

const entityRoleLabel = (role: RoleAxis): string => (role === 'origin' ? 'Provider' : 'Recipient');

const entityMenuTitle = (role: RoleAxis): string => `Select ${entityRoleLabel(role)}`;

/** The field a place token edits, for its trigger's accessible name: a
 *  directional anchor's role, else the place itself. */
const placeField = (token: SentenceToken): string =>
    token.role ? entityRoleLabel(token.role) : 'Place';

/** The field an option-list slot edits ("Sector"), for its menu title and
 *  its trigger's accessible name. */
const slotField = (slot: any): string => slot.key.label ?? 'Value';

// The ref a token's menu changes when it edits the one binding the token
// carries: its binding_ref, or none.
const ownRef = (token: SentenceToken): string[] => (token.binding_ref ? [token.binding_ref] : []);

/** The field a token states, for an About-only panel's title and its
 *  trigger's accessible name. */
const tokenField = (token: SentenceToken): string => {
    if (token.axis === 'what') return 'Measure';
    if (token.axis === 'unit') return 'Unit';
    if (token.axis === 'method') return 'Method';
    if (token.axis === 'source') return 'Source';
    if (token.axis === 'when') return 'Period';
    if (token.role || token.axis === 'where') return placeField(token);

    return 'Value';
};

/**
 * A real component (not a helper) so it can hold filter-text state. Ranked/
 * muted the same as every other option list in this file. Every row is a
 * toggle, the "Any provider"/"Any recipient" row first. Apply posts the whole
 * selected set as one identity edit, the empty set dropping the role.
 * currentDcids reseeds selected whenever the bound set changes underneath
 * the open popover.
 */
const EntityOptionRows = ({
    options,
    role,
    currentDcids,
    rankingBlocked,
    onApply,
}: {
    options: any[];
    role: RoleAxis;
    currentDcids: string[];
    rankingBlocked: boolean;
    onApply: (dcids: string[]) => void;
}) => {
    const [filter, setFilter] = useState('');
    const currentSet = new Set(currentDcids);
    const {
        selected,
        toggle: toggleSelected,
        clear,
        applyDisabled,
    } = useToggleSelection(currentDcids);
    const { current, rest } = splitCurrentPick(options, currentSet);
    const ranked = rankingBlocked ? rest : rankOptionsByCoverage(rest);
    const showFilter = shouldShowOptionFilter(ranked.length);
    const shown = showFilter
        ? filterOptionsByQuery(ranked, filter, (option) => optionLabel(option))
        : ranked;
    const roleWord = entityRoleLabel(role).toLowerCase();

    const toggle = (dcid: string | undefined) => {
        if (dcid) toggleSelected(dcid);
    };

    return (
        <>
            <AnySelectionRow label={`Any ${roleWord}`} selected={selected} onClear={clear} />
            {options.length === 0 && (
                <p className={styles.slotNote}>No {roleWord} options are available.</p>
            )}
            {showFilter && (
                <OptionFilterBar count={{ shown: shown.length, total: ranked.length }}>
                    <OptionFilterInput
                        value={filter}
                        onChange={setFilter}
                        label={`Filter listed ${roleWord}s`}
                    />
                </OptionFilterBar>
            )}
            {current.map((option: any) => {
                const dcid = entityOptionDcid(option);

                return (
                    <DropdownMenu.Item
                        key={dcid ?? optionLabel(option)}
                        asChild
                        onSelect={(event) => {
                            event.preventDefault();
                            toggle(dcid);
                        }}
                    >
                        <OptionRow
                            checked={!!dcid && selected.has(dcid)}
                            pinned
                            toggle
                            muted={optionMuted(option)}
                            meta={optionCoverageLabel(option)}
                        >
                            {optionLabel(option)}
                        </OptionRow>
                    </DropdownMenu.Item>
                );
            })}
            {shown.map((option: any) => {
                const dcid = option?.value?.ref?.ref;

                return (
                    <DropdownMenu.Item
                        key={dcid ?? optionLabel(option)}
                        asChild
                        onSelect={(event) => {
                            event.preventDefault();
                            toggle(dcid);
                        }}
                    >
                        <OptionRow
                            checked={!!dcid && selected.has(dcid)}
                            toggle
                            muted={optionMuted(option)}
                            meta={optionCoverageLabel(option)}
                        >
                            {optionLabel(option)}
                        </OptionRow>
                    </DropdownMenu.Item>
                );
            })}
            {shown.length === 0 && ranked.length > 0 && <NoFilterMatch />}
            <MultiSelectApplyButton
                selected={selected}
                disabled={applyDisabled}
                onApply={() => onApply([...selected])}
            />
        </>
    );
};

/** The composed sentence as displayed, notes left out. It names the hero
 *  <h1>, which would otherwise take its name from each slot trigger's longer
 *  accessible name. */
export const sentenceHeadingText = (response: any): string =>
    planSentenceText(response?.sentence_plan);

/** The space between two heading blocks of a plan of separate sentences. */
const HEADING_JOIN: SentenceToken = { kind: 'text', text: ' ', segment: 'heading' };

/** The tokens the <h1> draws: the plan's heading blocks, joined by a space.
 *  The engine's tokens carry their own spacing (`rendered_sentence` is
 *  their concatenation), so each block renders verbatim. */
export const headingTokens = (plan: readonly SentenceToken[] | null | undefined): SentenceToken[] =>
    sentenceBlocks(plan)
        .filter((block) => block.segment === 'heading')
        .flatMap((block, at) => (at === 0 ? block.tokens : [HEADING_JOIN, ...block.tokens]));

const lowerFirst = (text: string): string =>
    /^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;

// The answer block over every part of the resolve response, from the
// envelope's own composed `sentence_plan`: a muted coverage lead ("Answered
// 1 of 2 parts.") on a mixed answer, a muted "Closest match" lead when
// a part shows the nearest measure, the heading tokens inside the page's one
// <h1>, the byline (unit and source) in a <p> after it, every part's
// departures as a list, each with the one action it offers, and the
// assumptions clause ("Assumed: every provider.") in a closing <p>. The
// plan's own departure tokens are skipped, since the list reads
// `parts[].departures`. A
// part-indexed what/how token routes its menu to that part's own spec; a
// part-indexed where/when/source/role token routes to that same part's
// slot, window, or provider menu; a shared where/when/source token (part_index
// null) routes to every definite part via onEditShared; an unresolved
// part's own what-token renders as a marked phrase instead, its reason on
// hover. A candidates part's summary folds into one (foldReadings), and its
// reading cards below carry the choice. An entity_ambiguous part's menu
// hangs on each ambiguous wording's own slot token, listing the nodes that
// wording could name; a part whose plan carries no such token opens one menu
// over every wording on its what-token instead. A loading part's what-token,
// or its ambiguous wordings, carry an updating marker.
// No token here is minted: every connective and casing choice is the
// engine's, rendered as plain text where it isn't itself a slot.
//
// Every token menu with a binding_ref is controlled through one open state
// keyed by (part index, binding_ref), so a departure's action can open the
// menu of the token its ref names (`tokenMenu`).
export const SearchSentenceHeading = ({
    response,
    parts,
    optionsBySpec,
    entityOptionsBySpec,
    placeOptionsBySpec,
    baseStreamOpen,
    onEditSlot,
    onEditEntity,
    onEditWindow,
    onEditMeasure,
    onEditFacet,
    onEditParsed,
    onEditShared,
    onRefine,
    fallback,
    onStudio,
    newTokenTexts,
    refine,
    onRefineOpen,
}: SearchSentenceHeadingProps) => {
    // The plan index of the token whose menu is open.
    const [openMenu, setOpenMenu] = useState<number | null>(null);

    // A candidates part's summary reads as one marked phrase; its reading
    // cards draw the readings.
    const rawPlan = foldReadings(
        response?.sentence_plan ?? [],
        parts.map((part) => part.part),
    );
    const partCount = parts.length;
    // Each token's place in the plan: its React key and its menu's identity.
    const planIndex = new Map(rawPlan.map((token, index) => [token, index]));
    const heading = headingTokens(rawPlan);
    const bylines = sentenceBlocks(rawPlan).filter((block) => block.segment === 'byline');

    // An unsupported single-part plan carries no rendered_sentence at all,
    // so falls back to that part's own unsupported.detail explanation
    // instead of rendering nothing.
    const soloUnsupportedText =
        response &&
        rawPlan.length === 0 &&
        parts.length === 1 &&
        parts[0].part?.status === 'unsupported'
            ? unresolvedPartText(parts[0].part)
            : null;

    // The refs each token menu drawn this render can change, by plan index,
    // so a departure offers to open only a menu that offers a choice for
    // its ref.
    const menuChanges = new Map<number, ReadonlySet<string>>();

    // The controlled-open props for the menu of the token at plan index
    // `index`, which can change the refs `changes` names, so a departure
    // can open the menu of the token that states its ref. Closing clears
    // the state only when it is this menu's, so a menu closing as another
    // opens cannot close the new one.
    const tokenMenu = (index: number, changes: readonly string[]) => {
        menuChanges.set(index, new Set(changes));

        return {
            open: openMenu === index,
            onOpenChange: (open: boolean) =>
                setOpenMenu((current) => (open ? index : current === index ? null : current)),
        };
    };

    // A token panel's head on `spec`: the controlled-open props and the
    // About block for the token's current value.
    const tokenPanel = (
        index: number,
        token: SentenceToken,
        spec: any,
        changes: readonly string[],
    ) => ({
        ...tokenMenu(index, changes),
        about: (
            <TokenAbout
                about={tokenAbout(token, spec, refsStatedBesides(rawPlan, partCount, token))}
                statVarSpec={token.axis === 'what' ? singleStatVarSpec(spec) : null}
            />
        ),
    });

    // The panel of a token with nothing to pick: its About block alone.
    const aboutPanel = (
        index: number,
        token: SentenceToken,
        spec: any,
        variable?: string | null,
    ) => {
        const field = tokenField(token);

        return (
            <SlotMenu
                key={index}
                {...tokenPanel(index, token, spec, [])}
                label={token.text}
                title={`About this ${field.toLowerCase()}`}
                ariaLabel={slotAriaLabel(field, token.text, variable)}
            />
        );
    };

    // A unit token's menu over the same measure at another price basis,
    // where the answer offers no conversion: a pick switches each part the
    // token speaks for to its own sibling measure, like a measure switch.
    const unitSwitchMenu = (
        index: number,
        token: SentenceToken,
        spec: any,
        switches: readonly UnitSwitch[],
        variable?: string | null,
    ) => {
        // The current row's definition is the About line's, so the row
        // carries none.
        const [, ...switchValues] = menuRowValues(
            spec,
            switches.map((entry) => entry.measure),
        );

        return (
            <SlotMenu
                key={index}
                {...tokenPanel(index, token, spec, tokenStates(token))}
                label={token.text}
                title="Select Unit"
                ariaLabel={slotAriaLabel('Unit', token.text, variable)}
            >
                <DropdownMenu.Item asChild onSelect={() => {}}>
                    <OptionRow checked>{token.text}</OptionRow>
                </DropdownMenu.Item>
                {switches.map((entry, at) => (
                    <DropdownMenu.Item
                        key={entry.measure.definition.spec_id}
                        asChild
                        onSelect={() => onEditMeasure(entry.picks)}
                    >
                        <OptionRow info={<MeasureInfo values={switchValues[at] ?? []} />}>
                            {capitalise(entry.measure.label)}
                        </OptionRow>
                    </DropdownMenu.Item>
                ))}
            </SlotMenu>
        );
    };

    const definiteParts = parts.filter(
        (part) => part.part?.status === 'definite' && part.hydratedSpec,
    );

    // A hoisted qualifier's own current value/options come from a
    // representative definite part — by hoisting's own definition every
    // contributing part agrees, so any one of them reads the same.
    const representativePart = definiteParts[0] ?? null;
    const representative: any = representativePart?.hydratedSpec ?? null;

    // The entity_ambiguous parts with a picker whose ambiguous wordings ride
    // the plan as their own slot tokens: each carries its menu and its
    // updating marker there, and the part's what-token falls back to an
    // UnresolvedToken.
    const wordingParts = new Set(
        heading.flatMap((token) => {
            const partIndex = tokenPart(token, partCount);
            const part = partIndex == null ? null : parts[partIndex]?.part;

            return partIndex != null &&
                offersAmbiguousPicker(part) &&
                ambiguousWordingGroup(token, part.no_data)
                ? [partIndex]
                : [];
        }),
    );

    // A typed phrase re-runs the heading with this token's text replaced.
    // The byline and departures stay out of the re-run query.
    const refineAt = (token: SentenceToken) => (text: string) =>
        onRefine(spliceSentence(heading, heading.indexOf(token), text));

    // A part-indexed token whose part has already resolved: the same
    // per-token switch the single-part page uses, scoped to that
    // part's own spec — covers what/how, and every qualifier axis
    // (where/when/source/provider) that this token's part carries its own copy
    // of rather than sharing.
    const renderSpecToken = (
        token: SentenceToken,
        index: number,
        partIndex: number,
        spec: any,
        restatement: ParsedPart | null,
    ) => {
        // Named in each trigger's accessible name when several parts share
        // the sentence.
        const variable = parts.length > 1 ? parts[partIndex]?.variableText : null;
        // Called only where a menu is drawn, with the refs it can change:
        // by default the slot the token binds.
        const panel = (changes: readonly string[] = ownRef(token)) =>
            tokenPanel(index, token, spec, changes);

        // The unit. A convertible answer offers any currency at current or
        // constant prices, a pick resubmitting with the unit request. Else
        // a menu over the same measure at another price basis, a pick
        // resubmitting like a measure switch. With neither, its About block
        // alone.
        if (token.axis === 'unit') {
            const conversion = unitConversion(spec);

            if (conversion) {
                return (
                    <SlotMenu
                        key={index}
                        {...panel(tokenStates(token))}
                        label={token.text}
                        title="Select Unit"
                        ariaLabel={slotAriaLabel('Unit', token.text, variable)}
                    >
                        <UnitPicker
                            spec={spec}
                            conversion={conversion}
                            onPick={(request) => {
                                setOpenMenu(null);
                                onEditFacet(partIndex, spec, 'unit', {
                                    state: 'value',
                                    request,
                                });
                            }}
                        />
                    </SlotMenu>
                );
            }

            const switches = unitSwitches([{ index: partIndex, spec }]);

            return switches.length > 0
                ? unitSwitchMenu(index, token, spec, switches, variable)
                : aboutPanel(index, token, spec, variable);
        }

        // The measurement method the identity binds: a pick binds another,
        // "Any method" drops the binding. With nothing to switch to, its
        // About block alone.
        if (token.axis === 'method') {
            const picker = methodPicker(spec);

            if (!picker) return aboutPanel(index, token, spec, variable);

            return (
                <SlotMenu
                    key={index}
                    {...panel(tokenStates(token))}
                    label={token.text}
                    title="Select Measurement Method"
                    ariaLabel={slotAriaLabel('Method', token.text, variable)}
                >
                    <MethodChoices
                        picker={picker}
                        onPick={(binding) =>
                            onEditFacet(partIndex, spec, 'measurementMethod', binding)
                        }
                    />
                </SlotMenu>
            );
        }

        // The measure: its alternatives, then a group per slot the token
        // states with options ("flow" under "gross ODA disbursements"). With
        // neither, falls through to the generic binding_ref fallback: the
        // About block, any related measures, and a search for a different
        // one.
        const states = tokenStates(token);
        const alternatives = token.axis === 'what' ? measureAlternatives(spec) : [];
        const groups = token.axis === 'what' ? measureSlotGroups(spec, states, optionsBySpec) : [];

        if (alternatives.length > 0 || groups.length > 0) {
            const rowValues = menuRowValues(spec, alternatives);
            // The current row's definition is the About line's, so the
            // row carries none.
            const [, ...alternativeValues] = rowValues;

            return (
                <SlotMenu
                    key={index}
                    {...panel(measureMenuRefs(spec, states, groups, alternatives.length > 0))}
                    label={token.text}
                    title="Select Measure"
                    ariaLabel={slotAriaLabel('Measure', token.text, variable)}
                >
                    {/* The current measure, non-toggleable — same "implicit
                        checked, no-op onSelect" pattern the source slot's
                        own current-attribution row uses just above. */}
                    <DropdownMenu.Item asChild onSelect={() => {}}>
                        <OptionRow checked>{spec.measure_label ?? token.text}</OptionRow>
                    </DropdownMenu.Item>
                    {alternatives.map((alternative: SpecAlternativeMeasure, at: number) => (
                        <DropdownMenu.Item
                            key={alternative.definition.spec_id}
                            asChild
                            onSelect={() => onEditMeasure([{ partIndex, measure: alternative }])}
                        >
                            <OptionRow
                                meta={rowsLabel(
                                    alternative.served_rows,
                                    alternative.served_rows_exact,
                                )}
                                info={<MeasureInfo values={alternativeValues[at] ?? []} />}
                            >
                                {alternative.label}
                            </OptionRow>
                        </DropdownMenu.Item>
                    ))}
                    {groups.map(({ slot, slotIndex, entry }) => (
                        <div key={keyRef(slot.key)} className={styles.measureGroup}>
                            <p className={styles.slotGroupTitle}>{capitalise(slotField(slot))}</p>
                            {renderOptionMenu(slot, entry, (binding) =>
                                onEditSlot(partIndex, spec, slotIndex, binding),
                            )}
                        </div>
                    ))}
                </SlotMenu>
            );
        }

        if (token.axis === 'source') {
            const sourceOptions = sourceSlotOptions(spec);
            const sourceSlotIndex = (spec.slots ?? []).findIndex(
                (slot: any) => slot?.key?.axis === 'source',
            );

            if (sourceSlotIndex === -1 || sourceOptions.length === 0) {
                return aboutPanel(index, token, spec, variable);
            }

            const boundDcid = spec.slots[sourceSlotIndex]?.binding?.value?.ref?.ref;

            // A lone source opens the menu too, its row the current pick.
            //
            // The engine can render the source it actually used even with
            // the slot unbound (a single observed source). That option is
            // the current pick too, pinned the same way, but it's factual
            // attribution rather than a filter: nothing to uncheck.
            const impliedDcid =
                boundDcid ??
                sourceOptions.find((option) => token.text.trim() === sourceOptionLabel(option))
                    ?.value?.ref?.ref;
            const { current, rest } = splitCurrentPick(sourceOptions, impliedDcid);
            const sourceRow = (option: SourceSlotOption, checked?: boolean) => {
                const dcid = option.value.ref.ref;

                return (
                    <OptionRow
                        checked={checked}
                        pinned={checked}
                        detail={sourceOrigin(spec, dcid)}
                        // The current source's description is the About
                        // line's, so its row carries none.
                        info={checked ? undefined : <SourceInfo dcid={dcid} />}
                    >
                        {sourceOptionLabel(option)}
                    </OptionRow>
                );
            };

            return (
                <SlotMenu
                    key={index}
                    {...panel([keyRef(spec.slots[sourceSlotIndex].key)])}
                    label={token.text}
                    title="Select Data Source"
                    ariaLabel={slotAriaLabel('Data source', token.text, variable)}
                >
                    {current && (
                        <DropdownMenu.Item
                            asChild
                            onSelect={() => {
                                if (!boundDcid) return;
                                onEditSlot(partIndex, spec, sourceSlotIndex, { kind: 'unbound' });
                            }}
                        >
                            {sourceRow(current, true)}
                        </DropdownMenu.Item>
                    )}
                    {rest.map((option) => (
                        <DropdownMenu.Item
                            key={option.value.ref.ref}
                            asChild
                            onSelect={() =>
                                onEditSlot(partIndex, spec, sourceSlotIndex, {
                                    kind: 'value',
                                    value: option.value,
                                })
                            }
                        >
                            {sourceRow(option)}
                        </DropdownMenu.Item>
                    ))}
                </SlotMenu>
            );
        }

        if (token.axis === 'when') {
            return (
                <SlotMenu
                    key={index}
                    {...panel()}
                    label={token.text}
                    title="Edit Time Range"
                    ariaLabel={slotAriaLabel('Time range', token.text, variable)}
                >
                    <WindowEditor
                        spec={spec}
                        label={token.text}
                        onApply={(value) => onEditWindow(partIndex, spec, value)}
                    />
                </SlotMenu>
            );
        }

        // The token role is authoritative: an open destination is not yet
        // in identity.entities, so deriving it from the existing identity
        // would incorrectly turn a recipient edit into observationAbout.
        const entityRole = token.role ?? null;
        const entityEntry = entityRole
            ? entityOptionsEntry(spec, entityOptionsBySpec, entityRole)
            : undefined;
        const entityOptions = entityEntry?.options ?? [];

        if (entityRole && awaitingEntityOptions(entityEntry, baseStreamOpen)) {
            const label = token.text.trim() || openEntityLabel(entityRole);

            return (
                <SlotMenu
                    key={index}
                    {...panel()}
                    label={label}
                    title={entityMenuTitle(entityRole)}
                    ariaLabel={slotAriaLabel(entityRoleLabel(entityRole), label, variable)}
                >
                    <p className={styles.slotNote}>
                        Checking {entityRoleLabel(entityRole).toLowerCase()}s with data…
                    </p>
                </SlotMenu>
            );
        }

        if (entityRole && entityEntry) {
            const currentEntities = currentEntityDcids(spec, entityRole);
            const label = token.text.trim() || openEntityLabel(entityRole);
            const rankingBlocked = optionCoverageRankingBlocked(
                response?.diagnostics?.warnings,
                spec.spec_id,
            );
            const applyPick = (dcids: string[]) =>
                onEditEntity(partIndex, spec, entityRole, dcids.length ? dcids : null);

            return (
                <SlotMenu
                    key={index}
                    {...panel()}
                    label={label}
                    title={entityMenuTitle(entityRole)}
                    ariaLabel={slotAriaLabel(entityRoleLabel(entityRole), label, variable)}
                >
                    {/* One merged list: a truncated streamed set seeds
                        PlaceScopeEditor's own live `peers` fetch instead of
                        stacking the raw streamed list above a second,
                        separately-fetched one — see PlaceScopeEditor's own
                        doc, editors.tsx. Both lead with the "Any provider"/
                        "Any recipient" row, per-part only, kept out of the
                        shared/hoisted menu (see renderSharedToken). */}
                    {entityEntry.truncated ? (
                        <PlaceScopeEditor
                            spec={spec}
                            role={entityRole}
                            seed={{ options: entityOptions, truncated: entityEntry.truncated }}
                            currentDcids={currentEntities}
                            rankingBlocked={rankingBlocked}
                            offerAny
                            onApply={(refs) => applyPick(refs.map((ref) => ref.dcid))}
                        />
                    ) : (
                        <EntityOptionRows
                            options={entityOptions}
                            role={entityRole}
                            currentDcids={currentEntities}
                            rankingBlocked={rankingBlocked}
                            onApply={applyPick}
                        />
                    )}
                </SlotMenu>
            );
        }

        // An open role ("from 81 providers") whose options never streamed: the
        // role menu lists them as it opens.
        if (entityRole && !token.entity_refs?.length) {
            const label = token.text.trim() || openEntityLabel(entityRole);

            return (
                <SlotMenu
                    key={index}
                    {...panel()}
                    label={label}
                    title={entityMenuTitle(entityRole)}
                    ariaLabel={slotAriaLabel(entityRoleLabel(entityRole), label, variable)}
                >
                    <PlaceScopeEditor
                        spec={spec}
                        role={entityRole}
                        onApply={(refs) =>
                            onEditEntity(
                                partIndex,
                                spec,
                                entityRole,
                                refs.length ? refs.map((ref) => ref.dcid) : null,
                            )
                        }
                    />
                </SlotMenu>
            );
        }

        // what/how/where, or anything else the engine binds to an option
        // list, joined by binding_ref.
        const slotIndex = (spec.slots ?? []).findIndex(
            (slot: any) => keyRef(slot.key) === token.binding_ref,
        );
        const optionsEntry = token.binding_ref
            ? slotOptionsEntry(optionsBySpec, spec.spec_id, token.binding_ref)
            : { options: [], truncated: false };
        const refine = refineAt(token);
        // A typed phrase edit posts a parsed entry instead of resplicing raw
        // text whenever the part has a restatement and the token's axis/role
        // maps to one of its fields. A how facet or a part with no
        // restatement keeps the raw-text splice.
        const applyPhraseEdit = (text: string) => {
            const axis = token.axis === 'unit' || token.axis === 'method' ? null : token.axis;
            const edited = resolveTypedEdit(restatement, axis, token.role ?? null, text);

            if (edited) {
                onEditParsed(partIndex, edited);
                return;
            }

            refine(text);
        };

        if (
            slotIndex !== -1 &&
            token.binding_ref &&
            awaitingSlotOptions(optionsBySpec, spec.spec_id, token.binding_ref, baseStreamOpen)
        ) {
            const field = slotField(spec.slots[slotIndex]);

            return (
                <SlotMenu
                    key={index}
                    {...panel()}
                    label={token.text}
                    title={`Select ${field}`}
                    ariaLabel={slotAriaLabel(capitalise(field), token.text, variable)}
                >
                    <p className={styles.slotNote}>Checking options with data…</p>
                </SlotMenu>
            );
        }

        // A slot whose only served option is its current value has nothing
        // to change: its About block alone.
        if (
            slotIndex !== -1 &&
            optionsEntry.options.length > 0 &&
            !slotOffersChoice(spec.slots[slotIndex], optionsEntry, spec)
        ) {
            return aboutPanel(index, token, spec, variable);
        }

        if (slotIndex === -1 || optionsEntry.options.length === 0) {
            // With no option list from the engine, a measure gets its
            // related measures and a search for a different one, places get
            // the lazy options-door place editor, any other phrase gets free
            // text. A
            // bound subject place carries no entity_refs (the where slot
            // itself is bound instead), so anchorDcid reads spec.slots too.
            if (token.axis === 'what') {
                const related = relatedMeasures(spec);

                return (
                    <SlotMenu
                        key={index}
                        {...panel(measureMenuRefs(spec, states, [], true))}
                        label={token.text}
                        title={related.title ? 'Select Measure' : 'About this measure'}
                        ariaLabel={slotAriaLabel('Measure', token.text, variable)}
                    >
                        {related.title && (
                            <div className={styles.measureRelated}>
                                <p className={styles.slotGroupTitle}>{related.title}</p>
                                {related.measures.map((measure) => (
                                    <DropdownMenu.Item
                                        key={measure.definition.spec_id}
                                        asChild
                                        onSelect={() => onEditMeasure([{ partIndex, measure }])}
                                    >
                                        <OptionRow info={<GraphInfo dcid={measure.stat_var.ref} />}>
                                            {measure.stat_var.label}
                                        </OptionRow>
                                    </DropdownMenu.Item>
                                ))}
                            </div>
                        )}
                        <div className={styles.measureSearch}>
                            <PhraseEditor
                                initial=""
                                label="Search for a different measure"
                                onApply={applyPhraseEdit}
                            />
                        </div>
                    </SlotMenu>
                );
            }

            const anchor = anchorDcid(token, spec);

            if (anchor) {
                // A listed pick posts a structured edit, routed by
                // Both are identity.entities under the hood, so both take the
                // whole Apply selection at once.
                const route = placeEditorPickRoute(token, spec);
                const editRole: EntityRoleKey = token.role ?? 'observationAbout';
                // A directional anchor binds entities.<role> to the whole
                // selection. A free-text anchor reruns the sentence, joining
                // every picked label as the query would phrase them.
                // Everything else binds the where slot to a value/set/unbound
                // binding.
                const applyPlaceSelection = (refs: { dcid: string; label: string }[]) => {
                    if (route.kind === 'entity') {
                        onEditEntity(
                            partIndex,
                            spec,
                            route.role,
                            refs.length ? refs.map((ref) => ref.dcid) : null,
                        );
                    } else if (route.kind === 'text') {
                        // Apply is disabled below for an empty selection.
                        // Raw text has no "unbind" a zero-length join could
                        // reach.
                        refine(refs.map((ref) => ref.label).join(' and '));
                    } else {
                        onEditSlot(
                            partIndex,
                            spec,
                            route.whereIndex,
                            entitySlotBindingForRefs(refs),
                            editRole,
                        );
                    }
                };

                return (
                    <SlotMenu
                        key={index}
                        {...panel()}
                        label={token.text}
                        title="Select Place"
                        ariaLabel={slotAriaLabel(placeField(token), token.text, variable)}
                    >
                        <PlaceEditor
                            spec={spec}
                            anchorDcid={anchor}
                            boundDcids={currentEntityDcids(spec, editRole)}
                            onPick={applyPhraseEdit}
                            onApply={applyPlaceSelection}
                            requireSelection={route.kind === 'text'}
                            // Only a directional anchor has an unbind to post
                            // (applyPlaceSelection's empty set). A subject
                            // place has no entities.<role> to clear.
                            offerAny={route.kind === 'entity'}
                            prefetched={placeOptionsForSpec(spec, placeOptionsBySpec)}
                            role={token.role ?? undefined}
                            baseStreamOpen={baseStreamOpen}
                        />
                    </SlotMenu>
                );
            }

            // A DEFAULT place scope ("across 216 countries"): no anchor, but
            // the where slot is right there — the peers surface lists every
            // country with data, and a pick binds the slot directly.
            if (token.axis === 'where') {
                const whereIndex = (spec.slots ?? []).findIndex(
                    (slot: any) => slot?.key?.axis === 'where',
                );

                if (whereIndex !== -1) {
                    return (
                        <SlotMenu
                            key={index}
                            {...panel()}
                            label={token.text}
                            title="Select Place"
                            ariaLabel={slotAriaLabel(placeField(token), token.text, variable)}
                        >
                            <PlaceScopeEditor
                                spec={spec}
                                role={token.role ?? 'observationAbout'}
                                onApply={(refs) =>
                                    onEditSlot(
                                        partIndex,
                                        spec,
                                        whereIndex,
                                        entitySlotBindingForRefs(refs),
                                        token.role ?? 'observationAbout',
                                    )
                                }
                            />
                        </SlotMenu>
                    );
                }
            }

            return (
                <SlotMenu
                    key={index}
                    {...panel()}
                    label={token.text}
                    title="Refine Phrase"
                    ariaLabel={slotAriaLabel('Phrase', token.text, variable)}
                >
                    <PhraseEditor initial={token.text} onApply={applyPhraseEdit} />
                </SlotMenu>
            );
        }

        const slot = spec.slots[slotIndex];
        const onSelect = (binding: any) =>
            onEditSlot(partIndex, spec, slotIndex, binding, token.role ?? 'observationAbout');
        // A level-scoped constraint slot (relation populated) skips the
        // free-text escape hatch renderOptionMenu's flat branch offers —
        // parent/current/children is the whole menu there. See
        // renderLevelOptions.
        const levelScoped = isLevelScopedOptions(optionsEntry.options);
        const field = slotField(slot);

        return (
            <SlotMenu
                key={index}
                {...panel()}
                label={token.text}
                title={`Select ${field}`}
                ariaLabel={slotAriaLabel(capitalise(field), token.text, variable)}
            >
                {renderOptionMenu(slot, optionsEntry, onSelect)}
                {/* The free-text escape hatch only where there is a real
                    list to escape from — a single-option menu's one action
                    is the uncheck. */}
                {!levelScoped && optionsEntry.options.length > 1 && (
                    <PhraseEditor initial={token.text} onApply={applyPhraseEdit} />
                )}
            </SlotMenu>
        );
    };

    // PlaceEditor lists only the representative part's choices, which a
    // sibling part may not support, so a pick re-runs the spliced sentence
    // and every part re-resolves the place on its own.
    const renderSharedToken = (token: SentenceToken, index: number) => {
        // Every hoisted part agrees on the token's value, so the
        // representative's spec describes it.
        const panel = (changes: readonly string[] = ownRef(token)) =>
            representative
                ? tokenPanel(index, token, representative, changes)
                : tokenMenu(index, changes);

        // The unit, when some part converts: the picker reads the unit from
        // the first convertible part, which states the unit every part
        // shares, and offers only what every convertible part serves, the
        // parts a pick applies to (sharedUnitEdit).
        const unitSpec =
            token.axis === 'unit'
                ? (definiteParts.find((part) => unitConversion(part.hydratedSpec))?.hydratedSpec ??
                  null)
                : null;
        const sharedConversion = unitSpec
            ? sharedOffer(definiteParts.flatMap((part) => unitConversion(part.hydratedSpec) ?? []))
            : null;

        if (unitSpec && sharedConversion) {
            return (
                <SlotMenu
                    key={index}
                    {...tokenPanel(index, token, unitSpec, tokenStates(token))}
                    label={token.text}
                    title="Select Unit"
                    ariaLabel={slotAriaLabel('Unit', token.text)}
                >
                    <UnitPicker
                        spec={unitSpec}
                        conversion={sharedConversion}
                        onPick={(request) => {
                            setOpenMenu(null);
                            onEditShared({ axis: 'unit', request });
                        }}
                    />
                </SlotMenu>
            );
        }

        // The unit with no conversion offer: the price bases every part can
        // switch to, read from the representative's siblings.
        if (token.axis === 'unit' && representative) {
            const switches = unitSwitches(refineParts(parts));

            if (switches.length > 0) return unitSwitchMenu(index, token, representative, switches);
        }

        // The method every hoisted part binds: a pick applies to each of
        // them, so the menu offers only what all of them offer.
        const sharedMethod =
            token.axis === 'method'
                ? sharedMethodPicker(
                      definiteParts.map((part) => part.hydratedSpec).filter(bindsMethod),
                  )
                : null;

        if (sharedMethod) {
            return (
                <SlotMenu
                    key={index}
                    {...panel(tokenStates(token))}
                    label={token.text}
                    title="Select Measurement Method"
                    ariaLabel={slotAriaLabel('Method', token.text)}
                >
                    <MethodChoices
                        picker={sharedMethod}
                        onPick={(binding) => onEditShared({ axis: 'method', binding })}
                    />
                </SlotMenu>
            );
        }

        if (token.axis === 'when') {
            return (
                <SlotMenu
                    key={index}
                    {...panel()}
                    label={token.text}
                    title="Edit Time Range"
                    ariaLabel={slotAriaLabel('Time range', token.text)}
                >
                    <WindowEditor
                        spec={representative}
                        label={token.text}
                        onApply={(value) => onEditShared({ axis: 'when', window: value })}
                    />
                </SlotMenu>
            );
        }

        if (token.axis === 'source') {
            const sourceOptions = sourceSlotOptions(representative);
            const sourceSlotIndex = (representative?.slots ?? []).findIndex(
                (slot: any) => slot?.key?.axis === 'source',
            );
            const sourceSlot =
                sourceSlotIndex !== -1 ? representative.slots[sourceSlotIndex] : null;
            const boundDcid = sourceSlot?.binding?.value?.ref?.ref;

            // A lone source opens the menu here too — see the per-part
            // branch above.
            return (
                <SlotMenu
                    key={index}
                    {...panel(sourceSlot ? [keyRef(sourceSlot.key)] : [])}
                    label={token.text}
                    title="Select Data Source"
                    ariaLabel={slotAriaLabel('Data source', token.text)}
                >
                    {sourceOptions.map((option) => {
                        const dcid = option.value.ref.ref;
                        const implicit =
                            !boundDcid && token.text.trim() === sourceOptionLabel(option);
                        const checked = dcid === boundDcid || implicit;

                        return (
                            <DropdownMenu.Item
                                key={dcid}
                                asChild
                                onSelect={() => {
                                    if (implicit) {
                                        return;
                                    }

                                    onEditShared({
                                        axis: 'source',
                                        binding: checked
                                            ? { kind: 'unbound' }
                                            : { kind: 'value', value: option.value },
                                    });
                                }}
                            >
                                <OptionRow
                                    checked={checked}
                                    detail={sourceOrigin(representative, dcid)}
                                    // As in the per-part menu, the About
                                    // line describes the current source.
                                    info={checked ? undefined : <SourceInfo dcid={dcid} />}
                                >
                                    {sourceOptionLabel(option)}
                                </OptionRow>
                            </DropdownMenu.Item>
                        );
                    })}
                </SlotMenu>
            );
        }

        const entityRole = token.role ?? null;
        const sharedEntry = entityRole
            ? sharedEntityOptions(
                  definiteParts.map((part) => part.hydratedSpec),
                  entityOptionsBySpec,
                  entityRole,
              )
            : undefined;
        const entityOptions = sharedEntry?.options ?? [];
        const directionalRoute = sharedDirectionalEditRoute(token.entity_refs, sharedEntry);

        if (entityRole && directionalRoute === 'shared-options' && sharedEntry && representative) {
            // Fans one pick out to every touched part at once, so this stays a
            // plain immediate pick rather than a toggle+Apply list.
            const currentEntities = currentEntityDcids(representative, entityRole);
            const label = token.text.trim() || openEntityLabel(entityRole);

            return (
                <SlotMenu
                    key={index}
                    {...panel()}
                    label={label}
                    title={entityMenuTitle(entityRole)}
                    ariaLabel={slotAriaLabel(entityRoleLabel(entityRole), label)}
                >
                    {entityOptions.map((option: any) => {
                        const checked = currentEntities.includes(option?.value?.ref?.ref);

                        return (
                            <DropdownMenu.Item
                                key={option?.value?.ref?.ref ?? optionLabel(option)}
                                asChild
                                onSelect={() =>
                                    onEditShared({
                                        axis: 'entity',
                                        role: entityRole,
                                        dcid: option.value.ref.ref,
                                    })
                                }
                            >
                                <OptionRow
                                    checked={checked}
                                    current={checked && currentEntities.length === 1}
                                    meta={optionCoverageLabel(option)}
                                >
                                    {optionLabel(option)}
                                </OptionRow>
                            </DropdownMenu.Item>
                        );
                    })}
                    {sharedEntry.truncated && <LevelHint>more options than shown</LevelHint>}
                </SlotMenu>
            );
        }

        if (entityRole && directionalRoute === 'bound-refine' && representative) {
            const anchor = token.entity_refs?.[0];

            if (anchor) {
                return (
                    <SlotMenu
                        key={index}
                        {...panel()}
                        label={token.text}
                        title={entityMenuTitle(entityRole)}
                        ariaLabel={slotAriaLabel(entityRoleLabel(entityRole), token.text)}
                    >
                        <PlaceEditor
                            spec={representative}
                            anchorDcid={anchor}
                            boundDcids={token.entity_refs ?? [anchor]}
                            onPick={refineAt(token)}
                            // No common candidate set to post a structured
                            // edit against, so a row reruns the sentence
                            // with its own label instead of collecting a
                            // set behind Apply.
                            onSelect={(ref) => refineAt(token)(ref.label)}
                            role={entityRole}
                        />
                    </SlotMenu>
                );
            }
        }

        // A directional token with no common candidate must not fall through
        // to a representative-backed picker: its choice would be fanned out
        // to siblings that did not advertise it.
        if (entityRole) {
            return representative ? (
                aboutPanel(index, token, representative)
            ) : (
                <span key={index}>{token.text}</span>
            );
        }

        if (token.axis === 'where') {
            // A bound subject place carries no entity_refs (the where slot
            // itself is bound instead), so anchorDcid reads representative's
            // slots too.
            const anchor = representative ? anchorDcid(token, representative) : undefined;

            if (anchor && representative) {
                return (
                    <SlotMenu
                        key={index}
                        {...panel()}
                        label={token.text}
                        title="Select Place"
                        ariaLabel={slotAriaLabel(placeField(token), token.text)}
                    >
                        <PlaceEditor
                            spec={representative}
                            anchorDcid={anchor}
                            boundDcids={currentEntityDcids(
                                representative,
                                token.role ?? 'observationAbout',
                            )}
                            onPick={refineAt(token)}
                            // Same single-pick reasoning as the bound-refine
                            // case above: no shared structured edit, so a
                            // row reruns the sentence with its own label.
                            onSelect={(ref) => refineAt(token)(ref.label)}
                            prefetched={placeOptionsForSpec(representative, placeOptionsBySpec)}
                            role={token.role ?? undefined}
                            baseStreamOpen={baseStreamOpen}
                        />
                    </SlotMenu>
                );
            }

            if (representative) {
                return (
                    <SlotMenu
                        key={index}
                        {...panel()}
                        label={token.text}
                        title="Select Place"
                        ariaLabel={slotAriaLabel(placeField(token), token.text)}
                    >
                        <PlaceScopeEditor
                            spec={representative}
                            role={token.role ?? 'observationAbout'}
                            // No common candidate set to post a structured
                            // multi-value edit against, so a row posts its
                            // own dcid immediately instead of collecting a
                            // set behind Apply.
                            onSelect={(ref) =>
                                onEditShared({
                                    axis: 'where',
                                    entityRole: token.role ?? 'observationAbout',
                                    binding: entitySlotBindingForRefs([ref]),
                                })
                            }
                        />
                    </SlotMenu>
                );
            }
        }

        return representative ? (
            aboutPanel(index, token, representative)
        ) : (
            <span key={index}>{token.text}</span>
        );
    };

    const renderToken = (token: SentenceToken, index: number) => {
        if (token.kind !== 'slot') {
            return <span key={index}>{token.text}</span>;
        }

        const partIndex = tokenPart(token, partCount);

        if (partIndex == null) {
            if (!token.text.trim()) {
                return null;
            }

            return renderSharedToken(token, index);
        }

        const hydratedPart = parts[partIndex];
        const wirePart = hydratedPart?.part ?? null;

        if (!wirePart) {
            return <span key={index}>{token.text}</span>;
        }

        const known = knownPart(wirePart);
        const wording = ambiguousWordingGroup(
            token,
            known?.status === 'no_data' ? known.no_data : undefined,
        );

        // While an edit targeting this part is in flight, its what-token (or
        // its ambiguous wordings, when the plan carries them) carries an
        // updating marker — the rest of the sentence still shows the part's
        // prior value until the edit resolves.
        const updating =
            hydratedPart.phase === 'loading' &&
            (wordingParts.has(partIndex) ? wording != null : token.axis === 'what');
        const withMarker = (node: React.ReactNode) =>
            updating ? (
                <Fragment key={index}>
                    {node}
                    <span className={styles.slotUpdating} title="Updating" aria-hidden="true" />
                </Fragment>
            ) : (
                node
            );

        if (wirePart.status !== 'definite') {
            // A candidates part's summary folds into this one what-token
            // (foldReadings); the reading cards below carry the choice.
            if (wirePart.status === 'candidates') {
                return withMarker(
                    <UnresolvedToken
                        key={index}
                        label={token.text}
                        reason={unresolvedPartText(wirePart)}
                    />,
                );
            }

            // An entity_ambiguous pick posts the refusal's option for it
            // unchanged as a parsed entry (entityChoicePart). A wording the
            // plan carries as its own slot token opens a menu of the options
            // that settle it; a part whose plan carries none opens one menu
            // over every wording on its what-token.
            if (wirePart.status === 'no_data' && offersAmbiguousPicker(wirePart)) {
                const groups = entityChoiceGroups(wirePart.no_data);
                const pick = (option: NoDataOption) => {
                    const posted = entityChoicePart(option);

                    if (posted) onEditParsed(partIndex, posted);
                };

                if (wording) {
                    return withMarker(
                        <SlotMenu
                            key={index}
                            label={token.text}
                            title={token.role ? entityMenuTitle(token.role) : 'Select Place'}
                            ariaLabel={slotAriaLabel(
                                token.role ? entityRoleLabel(token.role) : 'Place',
                                token.text,
                            )}
                            marked
                        >
                            {wording.options.map((option, optionIndex) => (
                                <DropdownMenu.Item
                                    key={optionIndex}
                                    asChild
                                    onSelect={() => pick(option)}
                                >
                                    <OptionRow>{option.label}</OptionRow>
                                </DropdownMenu.Item>
                            ))}
                        </SlotMenu>,
                    );
                }

                if (!wordingParts.has(partIndex)) {
                    return withMarker(
                        <SlotMenu
                            key={index}
                            label={token.text}
                            title={ambiguousEntityMenuTitle(wirePart)}
                            ariaLabel={slotAriaLabel('Match', token.text)}
                            marked
                        >
                            {groups.flatMap((group) =>
                                group.options.map((option, optionIndex) => (
                                    <DropdownMenu.Item
                                        key={`${group.text}:${optionIndex}`}
                                        asChild
                                        onSelect={() => pick(option)}
                                    >
                                        {/* Two ambiguous wordings share one
                                            menu, each row naming its own. */}
                                        <OptionRow detail={groups.length > 1 ? group.text : null}>
                                            {option.label}
                                        </OptionRow>
                                    </DropdownMenu.Item>
                                )),
                            )}
                        </SlotMenu>,
                    );
                }
            }

            return withMarker(
                <UnresolvedToken
                    key={index}
                    label={token.text}
                    reason={unresolvedPartText(wirePart)}
                />,
            );
        }

        if (!token.text.trim()) {
            // An unbound or silenced placeholder: nothing to click. The
            // token that states it, or Refine, edits it.
            return null;
        }

        if (!hydratedPart.hydratedSpec) {
            return <span key={index}>{token.text}</span>;
        }

        return withMarker(
            renderSpecToken(
                token,
                index,
                partIndex,
                hydratedPart.hydratedSpec,
                hydratedPart.part?.restatement ?? null,
            ),
        );
    };

    // A resolved token whose text wasn't already visible in the early
    // heading fades in on its own rather than as part of this whole swap.
    // Most often it's a slot that was an empty placeholder a moment ago
    // (source, window), now carrying its resolved value. Every other token,
    // including one that's technically a fresh DOM node the same as this
    // one (this whole heading remounts when `response` first lands), gets
    // no animation: it reads the same as it did a moment ago, so nothing
    // here should visibly change for it.
    const renderHeadingToken = (token: SentenceToken, at: number) => {
        const index = planIndex.get(token);

        if (index === undefined) return <span key={`join-${at}`}>{token.text}</span>;

        const node = renderToken(token, index);
        const text = token.text.trim();

        if (!node || !text || !newTokenTexts || newTokenTexts.has(text)) {
            return node;
        }

        return (
            <span key={`new-${index}`} className={styles.sentenceTokenNew}>
                {node}
            </span>
        );
    };

    // Drawn before the departures, which read `menuChanges` to tell which
    // token menus can change their refs.
    const headingNodes = soloUnsupportedText ?? heading.map(renderHeadingToken);
    const bylineNodes = bylines.map((block, at) => {
        const owner = block.tokens
            .map((token) => tokenPart(token, partCount))
            .find((partIndex) => partIndex != null);
        // A plan of one sentence per part has a byline per part.
        const prefix =
            bylines.length > 1 && owner != null ? (parts[owner]?.variableText ?? null) : null;

        return (
            <span key={at}>
                {at > 0 && ' '}
                {prefix && `${prefix}: `}
                {block.tokens.map((token) => renderToken(token, planIndex.get(token) ?? -1))}
            </span>
        );
    });

    // Before the response lands the block is the <h1> alone.
    const answerParts = response ? parts : [];
    const clauses = assumptionClauses(
        rawPlan,
        parts.map((part) => part.variableText ?? null),
    );
    // A candidates part's lead sits above its reading cards instead.
    const closestParts = answerParts.filter(
        (part) => part.part?.status !== 'candidates' && isClosestMatch(part.part),
    );
    const coverageLead = response ? planCoverageText(rawPlan) : '';
    const closestLead =
        closestParts.length === 0
            ? null
            : parts.length > 1
              ? `Closest match for ${closestParts.map((part) => part.variableText ?? `part ${part.index + 1}`).join(' and ')}`
              : 'Closest match';

    // A slot's label on part `partIndex`'s spec ("Type of flow").
    const slotLabel = (partIndex: number, bindingRef: string): string | null =>
        (parts[partIndex]?.hydratedSpec?.slots ?? []).find(
            (slot: any) => keyRef(slot.key) === bindingRef,
        )?.key?.label ?? null;

    // The action naming the departure's ref when it is a slot ("Change
    // flow" on the measure token), else the token's own field.
    const tokenActionLabel = (token: SentenceToken, partIndex: number, ref: string): string => {
        if (token.role === 'origin') return 'Show providers';
        if (token.role === 'destination') return 'Show recipients';
        if (token.axis === 'when') return 'Change years';
        if (token.axis === 'unit') return 'Change unit';
        if (token.axis === 'method') return 'Change method';
        if (token.axis === 'where') return 'Change place';

        const label = slotLabel(partIndex, ref);

        return label ? `Change ${lowerFirst(label)}` : 'Change';
    };

    const refineKeys = new Set(refine.map((item) => item.key));

    // The departure's action as a labelled run with the target it opens, or
    // null when it has none the page can carry out: a token action needs
    // the menu of the token that states its ref drawn with a choice for
    // that ref, a Refine action
    // needs Refine to list its binding.
    const runAction = (action: DepartureAction, asked: string | null | undefined) => {
        if (action.kind === 'studio') {
            const operations = parts[action.partIndex]?.part?.operations ?? [];
            const operation =
                operations.find((candidate) => candidate.phrase.trim() === asked?.trim()) ??
                operations[0];

            return {
                target: 'studio',
                label: operation ? operationButtonLabel(operation.verb) : 'Open in Studio',
                run: onStudio,
            };
        }

        if (action.kind === 'refine') {
            const key = refineKey(action.partIndex, action.bindingRef);

            if (!refineKeys.has(key)) return null;

            const label = slotLabel(action.partIndex, action.bindingRef);

            return {
                target: `refine:${key}`,
                label: label ? `Change ${lowerFirst(label)}` : 'Refine',
                run: () => onRefineOpen({ at: key }),
            };
        }

        const index = statingTokenIndex(rawPlan, partCount, action.partIndex, action.bindingRef);

        if (!menuChanges.get(index)?.has(action.bindingRef)) return null;

        return {
            target: `token:${index}`,
            label: tokenActionLabel(rawPlan[index], action.partIndex, action.bindingRef),
            run: () => setOpenMenu(index),
        };
    };

    // One action per target: a second departure on the same token (a
    // group read as members after its missing members) reads as text, and
    // the page offers Studio once, since it hands over the whole question.
    const offered = new Set<string>();
    const departureItems: DepartureItem[] = answerDepartures(
        answerParts.map(({ part, variableText }) => ({
            status: part?.status ?? 'unsupported',
            variable_text: variableText,
            departures: part?.departures ?? [],
            no_data:
                part && isKnownPart(part) && part.status === 'no_data' ? part.no_data : undefined,
            restatement: part?.restatement,
        })),
        rawPlan,
    ).map(({ key, prefix, departure, action }) => {
        const resolved = action ? runAction(action, departure.asked) : null;
        const runnable = resolved && !offered.has(resolved.target) ? resolved : null;

        if (runnable) offered.add(runnable.target);

        return {
            key,
            prefix,
            text: departure.text,
            action: runnable && {
                label: runnable.label,
                run: runnable.run,
                studio: runnable.target === 'studio',
            },
        };
    });

    return (
        <>
            {coverageLead && <p className={styles.coverageLead}>{coverageLead}</p>}
            {closestLead && <p className={styles.closestLead}>{closestLead}</p>}
            <h1
                className={styles.sentence}
                aria-label={(response && planSentenceText(rawPlan)) || undefined}
            >
                {response ? headingNodes : fallback}
            </h1>
            {bylineNodes.length > 0 && <p className={styles.byline}>{bylineNodes}</p>}
            {departureItems.length > 0 && <DepartureList items={departureItems} />}
            {clauses.length > 0 && (
                <p className={styles.assumptions}>
                    {clauses.map(({ key, prefix, text }) => (
                        <span key={key}>
                            {key > 0 && ' '}
                            {prefix && `${prefix}: `}
                            {text}
                        </span>
                    ))}
                </p>
            )}
        </>
    );
};

// One Refine entry: a slot's options, with a bound slot's current value
// beside its name, or an open role's entities. An entry with one option to
// pick is that option's row, so no submenu holds a single row.
const RefineEntry = ({
    item,
    several,
    onEditSlot,
    onEditEntity,
    onEditFacet,
    open,
    onOpenChange,
}: {
    item: RefineItem;
    // Several definite parts: each name carries its part's variable text.
    several: boolean;
    onEditSlot: SearchSentenceProps['onEditSlot'];
    onEditEntity: SearchSentenceProps['onEditEntity'];
    onEditFacet: SearchSentenceProps['onEditFacet'];
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) => {
    const { part } = item;
    const { spec } = part;
    const name = refineItemName(item);
    const label = several ? `${part.variableText ?? 'Dataset'} — ${name}` : name;

    if (item.kind === 'entity') {
        const { role, entry } = item;
        const pick = (option: any) => onEditEntity(part.index, spec, role, [option.value.ref.ref]);
        const [only] = entry.options;

        if (entry.options.length === 1 && !entry.truncated) {
            return (
                <DropdownMenu.Item asChild onSelect={() => pick(only)}>
                    <OptionRow detail={optionLabel(only)} meta={optionCoverageLabel(only)}>
                        {label}
                    </OptionRow>
                </DropdownMenu.Item>
            );
        }

        return (
            <OptionSubmenu label={label} open={open} onOpenChange={onOpenChange}>
                {entry.options.map((option: any) => (
                    <DropdownMenu.Item
                        key={option?.value?.ref?.ref ?? optionLabel(option)}
                        asChild
                        onSelect={() => pick(option)}
                    >
                        <OptionRow meta={optionCoverageLabel(option)}>
                            {optionLabel(option)}
                        </OptionRow>
                    </DropdownMenu.Item>
                ))}
                {entry.truncated && (
                    <>
                        <LevelHint>more options than shown</LevelHint>
                        <PlaceScopeEditor
                            spec={spec}
                            role={role}
                            onApply={(refs) =>
                                onEditEntity(
                                    part.index,
                                    spec,
                                    role,
                                    refs.length ? refs.map((ref) => ref.dcid) : null,
                                )
                            }
                        />
                    </>
                )}
            </OptionSubmenu>
        );
    }

    if (item.kind === 'facet') {
        return (
            <OptionSubmenu
                label={label}
                detail={item.current}
                open={open}
                onOpenChange={onOpenChange}
            >
                <MethodChoices
                    picker={item.picker}
                    onPick={(binding) => onEditFacet(part.index, spec, item.axis, binding)}
                />
            </OptionSubmenu>
        );
    }

    const { slot, slotIndex, entry, current } = item;
    const onSelect = (binding: any) => onEditSlot(part.index, spec, slotIndex, binding);
    const [only] = entry.options;

    // An unbound slot with one option: its row picks it.
    if (current == null && entry.options.length === 1 && !entry.truncated) {
        return (
            <DropdownMenu.Item
                asChild
                onSelect={() => onSelect({ kind: 'value', value: only.value })}
            >
                <OptionRow
                    detail={slotOptionLabel(slot, only)}
                    meta={rowsLabel(only.served_rows, only.served_rows_exact)}
                    info={optionInfo(only)}
                >
                    {label}
                </OptionRow>
            </DropdownMenu.Item>
        );
    }

    return (
        <OptionSubmenu label={label} detail={current} open={open} onOpenChange={onOpenChange}>
            {renderOptionMenu(slot, entry, onSelect)}
        </OptionSubmenu>
    );
};

/**
 * The Refine button, first in the actions row: the one route to the
 * bindings no token states (refineItems), each entry a submenu of its
 * options. It always renders, so options streaming in late do not shift
 * Start New; until the menu has entries it is disabled, and its name says
 * why. Each entry is controlled, so a departure's action can open it
 * (`open.at`). Closing one clears the state only when it is the open one,
 * so an entry closing as another opens cannot close the new one.
 */
const RefineMenu = ({
    items,
    pending,
    several,
    open,
    onOpenChange,
    onEditSlot,
    onEditEntity,
    onEditFacet,
}: {
    items: RefineItem[];
    // Options may still stream in (SearchSentenceBody's optionsPending).
    pending: boolean;
    several: boolean;
    open: RefineOpen | null;
    onOpenChange: Dispatch<SetStateAction<RefineOpen | null>>;
    onEditSlot: SearchSentenceProps['onEditSlot'];
    onEditEntity: SearchSentenceProps['onEditEntity'];
    onEditFacet: SearchSentenceProps['onEditFacet'];
}) => {
    const empty = items.length === 0;
    const entry = (key: string) => ({
        open: open?.at === key,
        onOpenChange: (opened: boolean) =>
            onOpenChange((current) =>
                opened ? { at: key } : current?.at === key ? { at: null } : current,
            ),
    });

    return (
        <DropdownMenu.Root
            modal={false}
            open={!empty && open != null}
            onOpenChange={(opened) =>
                onOpenChange((current) => (opened ? (current ?? { at: null }) : null))
            }
        >
            <DropdownMenu.Trigger asChild disabled={empty}>
                <span>
                    <Button
                        variant="outline"
                        className={styles.refineButton}
                        disabled={empty}
                        aria-label={
                            empty
                                ? pending
                                    ? 'Refine, options loading'
                                    : 'Refine, no options'
                                : undefined
                        }
                    >
                        Refine
                    </Button>
                </span>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content
                    ref={menuEntryFocusRef}
                    className={classNames(styles.slotMenu, styles.fitMenu)}
                    align="start"
                    sideOffset={2}
                    collisionPadding={16}
                    onKeyDownCapture={onMenuContentKeyDownCapture()}
                >
                    <p className={styles.slotMenuTitle}>Refine this answer</p>
                    <div className={styles.slotMenuBody}>
                        {items.map((item) => (
                            <RefineEntry
                                key={item.key}
                                item={item}
                                several={several}
                                onEditSlot={onEditSlot}
                                onEditEntity={onEditEntity}
                                onEditFacet={onEditFacet}
                                {...entry(item.key)}
                            />
                        ))}
                    </div>
                </DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu.Root>
    );
};

// SearchSentenceHeading's body: notes (see resultNotes), per-part errors, the
// actions row (Refine / Start New / About toggle), and the About accordion. Split out
// so DataSearch.tsx can mount SearchSentenceHeading's own <h1> at a stable
// position while this half only exists once `response` has landed. See
// SearchSentenceHeading's own doc comment above.
export const SearchSentenceBody = ({
    parts,
    optionsBySpec,
    onEditSlot,
    onEditEntity,
    onEditFacet,
    onStartNew,
    refine,
    optionsPending,
    refineOpen,
    onRefineOpenChange,
}: SearchSentenceBodyProps) => {
    const [whyOpen, setWhyOpen] = useState(false);
    const aboutId = useId();

    const definiteParts = parts.filter(
        (part) => part.part?.status === 'definite' && part.hydratedSpec,
    );

    const editNotes = [
        ...new Set(
            parts.flatMap((part) => {
                const note = collapsedCandidatesNote(part.part?.warnings);
                const label = parts.length > 1 && part.variableText ? `${part.variableText}: ` : '';

                return note ? [`${label}${note}`] : [];
            }),
        ),
    ];

    // A part whose latest edit was rejected (resolved to no_data/candidates)
    // or failed in transport — shown beside the sentence, the same way a
    // run-level error shows under the query, instead of a new region.
    const partErrors = parts.filter((part) => part.editError);

    const aboutParts = definiteParts.map((part) => ({
        index: part.index,
        variableText: part.variableText,
        spec: part.hydratedSpec,
        warnings: part.part?.warnings,
        assumptions: knownPart(part.part)?.assumptions,
    }));

    return (
        <>
            {editNotes.map((note) => (
                <p key={note} className={styles.noteLine}>
                    {note}
                </p>
            ))}

            {partErrors.map((part) => (
                <p key={part.index} className={styles.errorLine}>
                    {part.variableText ? `${part.variableText}: ` : ''}
                    {part.editError}
                </p>
            ))}

            <div className={styles.actions}>
                <RefineMenu
                    items={refine}
                    pending={optionsPending}
                    several={definiteParts.length > 1}
                    open={refineOpen}
                    onOpenChange={onRefineOpenChange}
                    onEditSlot={onEditSlot}
                    onEditEntity={onEditEntity}
                    onEditFacet={onEditFacet}
                />
                <Button variant="outline" onClick={onStartNew}>
                    Start New
                </Button>
                {aboutParts.length > 0 && (
                    <Button
                        variant="plain"
                        icon="chevron-down"
                        className={styles.quietAction}
                        data-open={whyOpen}
                        aria-expanded={whyOpen}
                        aria-controls={aboutId}
                        onClick={() => setWhyOpen((open) => !open)}
                    >
                        About this answer
                    </Button>
                )}
            </div>

            {aboutParts.length > 0 && (
                <div
                    id={aboutId}
                    className={classNames(styles.accordion, whyOpen && styles.accordionOpen)}
                    inert={!whyOpen}
                >
                    <div className={styles.accordionInner}>
                        <WhyPanel parts={aboutParts} open={whyOpen} optionsBySpec={optionsBySpec} />
                    </div>
                </div>
            )}
        </>
    );
};
