/* eslint-disable @typescript-eslint/no-explicit-any -- reads the raw wire envelope of another fixture */
/**
 * Two `/api/search/resolve` resolutions for one question with an `explain`
 * operation, before and after the user edits its place and year:
 *
 * - `definiteExplainOperation`: "Why did the population of Ethiopia fall in
 *   2023?", one definite part on Ethiopia in 2023 carrying the `explain`
 *   operation.
 * - `definiteExplainEdited`: the `dataset_resubmit` answer once the user
 *   has changed the place to Kenya and the year to 2022. The edit carries
 *   the operation back, so the part keeps it.
 *
 * Built from definite-single.ts: each spec is that capture's spec with its
 * place, window and sentence rewritten. The spec ids are made up; the site
 * never recomputes one.
 */

import { definiteSingle } from './definite-single.ts';

const source = definiteSingle as any;
const [sourcePart] = source.parts;

const explain = { verb: 'explain', phrase: 'why did it fall', over: null };

const populationAt = (specId: string, place: { dcid: string; label: string }, year: number) => {
    const { definition, resolved } = structuredClone(sourcePart.spec);
    const window = { start_year: year, end_year: year };

    definition.spec_id = specId;
    definition.identity.entities = { observationAbout: [place.dcid] };
    definition.identity.requested_window = { kind: 'range', ...window };
    resolved.entities = [{ ...resolved.entities[0], ref: place.dcid, label: place.label }];
    resolved.coverage.window = window;

    return { spec_id: specId, definition, resolved };
};

const sentence = (place: string, year: number) =>
    `Total population in ${place} in ${year}, according to 4 sources.`;

const query = 'Why did the population of Ethiopia fall in 2023?';

export const definiteExplainOperation: unknown = {
  "schema_version": source.schema_version,
  "kind": "resolution",
  "query_echo": {
    ...source.query_echo,
    "raw_query": query,
    "normalized_query": query
  },
  "diagnostics": source.diagnostics,
  "parts": [
    {
      "variable_text": sourcePart.variable_text,
      "warnings": [],
      "restatement": {
        "variable_text": "population",
        "entities": [{ "text": "Ethiopia" }],
        "time_text": "2023"
      },
      "operations": [explain],
      "status": "definite",
      "spec": populationAt(
        "spec_explain_ethiopia_2023",
        { dcid: "country/ETH", label: "Ethiopia" },
        2023
      )
    }
  ],
  "status": "definite",
  "rendered_sentence": sentence("Ethiopia", 2023),
  "sentence_plan": [{ "kind": "text", "text": sentence("Ethiopia", 2023), "segment": "heading" }]
};

export const definiteExplainEdited: unknown = {
  "schema_version": source.schema_version,
  "kind": "resolution",
  "query_echo": {
    "entry_path": "dataset_resubmit",
    "extract_skipped": true
  },
  "diagnostics": source.diagnostics,
  "parts": [
    {
      "variable_text": sourcePart.variable_text,
      "warnings": [],
      "restatement": null,
      "operations": [explain],
      "status": "definite",
      "spec": populationAt(
        "spec_explain_kenya_2022",
        { dcid: "country/KEN", label: "Kenya" },
        2022
      )
    }
  ],
  "status": "definite",
  "rendered_sentence": sentence("Kenya", 2022),
  "sentence_plan": [{ "kind": "text", "text": sentence("Kenya", 2022), "segment": "heading" }]
};
