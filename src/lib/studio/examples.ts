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
