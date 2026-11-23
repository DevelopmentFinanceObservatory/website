'use client';

import { useMemo, useState } from 'react';

import { ClimateBars } from './ClimateBars';
import { ContextSearch } from './ContextSearch';
import { DebtChart } from './DebtChart';
import { DonorList } from './DonorList';
import { usePageFigures } from './Figures';
import styles from './FragilityFinance.module.scss';
import { MoneyChart } from './MoneyChart';
import { Card, Panel } from './Panel';
import panelStyles from './Panel.module.scss';
import { PillarChart } from './PillarChart';
import { Reserved } from './Reserved';
import { Strip } from './Strip';

import type { GroupKey } from '../_data/types.ts';
import { FLOW_COLOURS, PILLAR_COLOURS } from '../_lib/chart.ts';
import {
    cardTitle,
    CLIMATE_TITLE,
    contextHeadline,
    debtTitle,
    DONOR_FOOT,
    groupHeadline,
    scopeName,
    SECTION_LEDES,
    SECTION_TITLES,
    SOURCE,
} from '../_lib/copy.ts';
import { scopeDebt, scopeDonors } from '../_lib/groups.ts';
import { DEBT_YEARS, FLOW_YEARS, PILLAR_YEARS } from '../_lib/profile.ts';
import {
    DEFAULT_SCOPE,
    findContext,
    GROUP_KEYS,
    groupLabel,
    toggleContext,
    type Scope,
} from '../_lib/scope.ts';
import { LIVING_STRIPS } from '../_lib/strip.ts';

import { useStoredCheckState } from '#lib/useStoredCheck.ts';

const LIVING_COLOUR = '#5e5e52';

/**
 * The interactive part of the page: the scope row, the one headline sentence, and every
 * section that follows the scope, from the money in and out to living conditions. Every figure
 * comes from the build's read of DFO (./FragilityPage.tsx), so its root's `data-read-tier` and
 * `data-read-live` are `built`, or from a read again when DFO stored newer data, which its
 * `data-stored-check` says (lib/storedCheck.ts).
 */
export const FragilityFinance = () => {
    const { contexts, groups } = usePageFigures();
    const storedCheck = useStoredCheckState();
    const [scope, setScope] = useState<Scope>(DEFAULT_SCOPE);
    const [group, setGroup] = useState<GroupKey>('all');
    const chosen = scope.kind === 'context' ? findContext(contexts, scope.iso3) : undefined;
    const name = scopeName(contexts, scope);
    const headline =
        chosen === undefined
            ? groupHeadline(contexts, scope.kind === 'group' ? scope.key : group)
            : contextHeadline(chosen, contexts.length);
    const onDot = (iso3: string) => setScope(toggleContext(scope, iso3, group));
    // Every text a scope can put in the headline and card titles, so each takes the room of
    // its longest at any width and a change of scope never moves the page below.
    const variants = useMemo(() => {
        const scopes: Scope[] = [
            ...GROUP_KEYS.map((key): Scope => ({ kind: 'group', key })),
            ...contexts.map((context): Scope => ({ kind: 'context', iso3: context.iso3 })),
        ];
        const names = scopes.map((each) => scopeName(contexts, each));

        return {
            headlines: [
                ...GROUP_KEYS.map((key) => groupHeadline(contexts, key)),
                ...contexts.map((context) => contextHeadline(context, contexts.length)),
            ],
            flowTitles: names.map((each) => cardTitle(each, FLOW_YEARS)),
            pillarTitles: names.map((each) => cardTitle(each, PILLAR_YEARS)),
            debtTitles: scopes.map((each) =>
                debtTitle(contexts, each, scopeDebt(contexts, each), DEBT_YEARS),
            ),
        };
    }, [contexts]);
    const strip = (stripKey: Parameters<typeof Strip>[0]['stripKey'], colour: string) => (
        <div className={panelStyles.below}>
            <Strip
                contexts={contexts}
                stripKey={stripKey}
                scope={scope}
                colour={colour}
                onSelect={onDot}
            />
        </div>
    );

    return (
        <div
            className={styles.island}
            data-read-tier="built"
            data-read-live="built"
            data-stored-check={storedCheck ?? undefined}
        >
            <div className={styles.top}>
                <div className={styles.controls}>
                    <span className={styles.seg} role="group" aria-label="Contexts shown">
                        {GROUP_KEYS.map((key) => (
                            <button
                                key={key}
                                type="button"
                                aria-pressed={scope.kind === 'group' && scope.key === key}
                                onClick={() => {
                                    setGroup(key);
                                    setScope({ kind: 'group', key });
                                }}
                            >
                                {groupLabel(contexts, key)}
                            </button>
                        ))}
                    </span>
                    <ContextSearch
                        contexts={contexts}
                        chosen={chosen}
                        onChoose={(iso3) => setScope({ kind: 'context', iso3 })}
                        onClear={() => setScope({ kind: 'group', key: group })}
                    />
                </div>
                <p className={styles.headline} aria-live="polite">
                    <Reserved text={headline} variants={variants.headlines} block />
                </p>
            </div>

            <Panel id="money" title={SECTION_TITLES.money} lede={SECTION_LEDES.money}>
                <Card
                    title={cardTitle(name, FLOW_YEARS)}
                    titles={variants.flowTitles}
                    sources={[SOURCE.crs, SOURCE.wdi, SOURCE.sdg, SOURCE.ids]}
                >
                    <MoneyChart contexts={contexts} scope={scope} />
                    {strip('odaShare', FLOW_COLOURS.oda)}
                </Card>
            </Panel>

            <Panel id="debt" title={SECTION_TITLES.debt} lede={SECTION_LEDES.debt}>
                <Card
                    title={debtTitle(contexts, scope, scopeDebt(contexts, scope), DEBT_YEARS)}
                    titles={variants.debtTitles}
                    sources={[SOURCE.ids, SOURCE.crs]}
                >
                    <DebtChart contexts={contexts} scope={scope} />
                    {strip('debtPerOda', FLOW_COLOURS.debtService)}
                </Card>
            </Panel>

            <Panel id="aid" title={SECTION_TITLES.aid} lede={SECTION_LEDES.aid}>
                <Card
                    title={cardTitle(name, PILLAR_YEARS)}
                    titles={variants.pillarTitles}
                    sources={[SOURCE.crs, SOURCE.dac1]}
                    note={DONOR_FOOT}
                >
                    <PillarChart contexts={contexts} scope={scope} />
                    {strip('humanitarianShare', PILLAR_COLOURS.humanitarian)}
                    <div className={panelStyles.below}>
                        <DonorList donors={scopeDonors(contexts, groups, scope)} />
                    </div>
                </Card>
            </Panel>

            <Panel id="climate" title={SECTION_TITLES.climate} lede={SECTION_LEDES.climate}>
                <Card title={CLIMATE_TITLE} sources={[SOURCE.climate]}>
                    <ClimateBars contexts={contexts} scope={scope} />
                </Card>
            </Panel>

            <Panel id="living" title={SECTION_TITLES.living} lede={SECTION_LEDES.living}>
                <Card sources={[SOURCE.sdg]}>
                    {LIVING_STRIPS.map((key, index) => (
                        <Strip
                            key={key}
                            contexts={contexts}
                            stripKey={key}
                            scope={scope}
                            colour={LIVING_COLOUR}
                            onSelect={onDot}
                            showTicks={index === LIVING_STRIPS.length - 1}
                        />
                    ))}
                </Card>
            </Panel>
        </div>
    );
};
