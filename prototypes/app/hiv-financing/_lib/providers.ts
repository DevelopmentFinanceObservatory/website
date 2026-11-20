// The three providers the page separates, with the label and colour every chart, key and
// table uses for them.
import type { ProviderKey } from '../_data/types.ts';

export type Provider = { key: ProviderKey; label: string; colour: string };

/** In stacking order, bottom to top: the United States, the Global Fund, all others. */
export const PROVIDERS = [
    { key: 'us', label: 'United States', colour: '#6467de' },
    { key: 'globalFund', label: 'Global Fund', colour: '#2a9d8f' },
    // Dark enough for 3:1 against the page (#fff) and the panel (#f6f6e8), as WCAG asks of graphics.
    { key: 'other', label: 'All other providers', colour: '#a5841f' },
] as const satisfies readonly Provider[];

export const PROVIDER_KEYS: readonly ProviderKey[] = PROVIDERS.map((provider) => provider.key);

/** The Global Fund's multi-disease grants under codes 12110 and 12250, drawn hatched in the
 *  Global Fund's colour above the HIV stack, because only part of each grant is for HIV. */
export const GF_MULTI = {
    key: 'globalFundMulti',
    label: 'Global Fund multi-disease grants (partly HIV)',
    colour: '#2a9d8f',
} as const;
