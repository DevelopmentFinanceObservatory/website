import type { PromptSource } from './wire.ts';

/**
 * Example prompts under the Studio landing's prompt box. Each one drew its
 * first card in under 50 seconds in production or on the dev agent, with no
 * error. A visit shows EXAMPLES_SHOWN of them, drawn by the page on the
 * server so the HTML and the hydrated page agree.
 */
export const EXAMPLE_PROMPTS = [
    'Compare per capita health spending in Kenya, Niger, and Liberia',
    'What does G7 aid data for the latest year look like?',
    'Compare under-5 mortality rates in Sierra Leone and Nigeria',
    'How much does the DRC spend to service its debt each year since 2008?',
    "Show me Zimbabwe's debt composition held in different currencies",
    'Compare remittances to Nigeria, Ethiopia and South Africa since 2015',
    // Broad enough to draw a research plan first.
    'Give me a comprehensive overview of health spending in Kenya',
    'What share of the ODA Kenya receives goes to health?',
    'Which donor gave Kenya the most ODA in each year from 2018 to 2022?',
    "Show Kenya's and Nigeria's external debt as a share of GDP over time",
] as const;

/** The question the Studio landing's data-availability button sends as the
 *  first turn. It is specific enough that the agent answers it outright
 *  without asking what is meant. */
export const DATA_AVAILABILITY_PROMPT =
    'What data is available in DFO? Give me an overview of the datasets, publishers, countries and years covered, so I can ask about what interests me.';

export const EXAMPLES_SHOWN = 3;

/** `count` distinct prompts from `pool`, in random order (a partial
 *  Fisher–Yates shuffle). `random` returns a number in [0, 1). */
export const pickExamples = (
    pool: readonly string[] = EXAMPLE_PROMPTS,
    count = EXAMPLES_SHOWN,
    random: () => number = Math.random,
): string[] => {
    const deck = [...pool];
    const drawn = Math.min(count, deck.length);

    for (let i = 0; i < drawn; i++) {
        const j = i + Math.floor(random() * (deck.length - i));

        [deck[i], deck[j]] = [deck[j]!, deck[i]!];
    }

    return deck.slice(0, drawn);
};

/** The `/studio` query param that says how a question came from Data
 *  search (studioHref in src/lib/search/studioHandoff.ts): `example` for a
 *  Data search example, `route_auto` for the search API's automatic move to
 *  Studio, and `route_offer` for a click on its Studio offer. */
export const HANDOFF_VIA_PARAM = 'via';

/** The `/studio` query param that carries the trace id of the search a
 *  routed question (`route_auto` or `route_offer`) came from, so the
 *  way-back event joins the search API's log. */
export const HANDOFF_TRACE_PARAM = 'trace';

/** A question the search API's router moved to Studio on its own
 *  (`via=route_auto`): the question and the routed search's trace id. Any
 *  other arrival is null. */
export const routedArrival = (
    params: URLSearchParams,
): { question: string; traceId: string | null } | null => {
    const question = params.get('q');

    return question && params.get(HANDOFF_VIA_PARAM) === 'route_auto'
        ? { question, traceId: params.get(HANDOFF_TRACE_PARAM) }
        : null;
};

/** The prompt source of a `/studio?q=` arrival: `search_example` for
 *  `via=example`, and none for anything else. */
export const handoffPromptSource = (via: string | null): PromptSource | undefined =>
    via === 'example' ? 'search_example' : undefined;
