/**
 * A dataset pattern read as one sentence. The parts are text and term
 * references, so a screen can render each term as a link.
 */
import type { Model } from './model.ts';
import type { OntologyPattern } from './wire.ts';

export type SentencePart =
    | { readonly kind: 'text'; readonly text: string }
    | { readonly kind: 'term'; readonly id: string; readonly label: string };

/** Terms joined with commas and a final "and": `a`, `a and b`, `a, b and c`. */
const series = (model: Model, ids: readonly string[]): SentencePart[] =>
    ids.flatMap((id, index): SentencePart[] => {
        const term: SentencePart = { kind: 'term', id, label: model.label(id) };
        if (index === 0) return [term];
        const joiner = index === ids.length - 1 ? ' and ' : ', ';
        return [{ kind: 'text', text: joiner }, term];
    });

/**
 * "The <measured property> of a <population type>, measured as <qualifier>,
 * reported by <role> | between <a> and <b>, split by <a>, <b> and <c>."
 * A clause with nothing to say is left out.
 */
export function patternSentence(
    model: Model,
    pattern: Pick<
        OntologyPattern,
        | 'population_type'
        | 'measured_property'
        | 'measurement_qualifier'
        | 'observation_properties'
        | 'constraint_properties'
    >,
): SentencePart[] {
    const text = (value: string): SentencePart => ({ kind: 'text', text: value });
    const term = (id: string): SentencePart => ({ kind: 'term', id, label: model.label(id) });

    const parts: SentencePart[] = [text('The '), term(pattern.measured_property)];
    if (pattern.population_type !== null) {
        parts.push(text(' of a '), term(pattern.population_type));
    }
    if (pattern.measurement_qualifier !== null) {
        parts.push(text(', measured as '), term(pattern.measurement_qualifier));
    }
    const { observation_properties: between, constraint_properties: split } = pattern;
    if (between.length === 1) {
        parts.push(text(', reported by '), ...series(model, between));
    } else if (between.length > 1) {
        parts.push(text(', between '), ...series(model, between));
    }
    if (split.length > 0) parts.push(text(', split by '), ...series(model, split));
    parts.push(text('.'));
    return parts;
}
