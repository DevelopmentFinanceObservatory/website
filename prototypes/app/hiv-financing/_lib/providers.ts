// The three providers the page separates, with the label and colour every chart, key and
// table uses for them.
import type { ProviderKey } from '../_data/types.ts';

export type Provider = { key: ProviderKey; label: string; colour: string };

/** In stacking order, bottom to top: the United States, the Global Fund, all others. */
export const PROVIDERS = [
    { key: 'us', label: 'United States', colour: '#6467de' },
    { key: 'globalFund', label: 'Global Fund', colour: '#2a9d8f' },
    { key: 'other', label: 'All other providers', colour: '#c9a227' },
] as const satisfies readonly Provider[];

export const PROVIDER_KEYS: readonly ProviderKey[] = PROVIDERS.map((provider) => provider.key);
