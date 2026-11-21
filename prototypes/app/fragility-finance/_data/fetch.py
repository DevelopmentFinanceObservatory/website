# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["development-finance==0.6.0"]
# ///
"""The fragility-finance data step, run by hand with `pnpm data fragility-finance`.

Reads the OECD's 2026 fragility classification from `fragility-2026.tsv` and fetches,
for each of its 62 contexts, the money that reaches it and the money it pays out:

- gross ODA disbursements from the OECD CRS, 2015 to 2024, split into the OECD's
  humanitarian, development and peace pillars by purpose code, and by provider in 2024;
- each DAC member's total ODA in 2024 and 2025 from DAC1, for the change in 2025;
- gross other official flows (OOF) disbursements from the OECD CRS, 2015 to 2024, zero in a
  year with none recorded, since the CRS records every OOF its reporters disburse;
- inward remittances (WDI) and FDI inflows (SDG database), 2015 to 2024;
- public external debt service from World Bank IDS, 2015 to 2033, projected after 2025;
- climate finance received from ONE Data in 2024 under ONE's own method, for adaptation,
  mitigation and both;
- population (UNICEF) in 2024 and three living-conditions indicators (SDG database), latest
  year.

DFO computes the figures that sum or rank many rows: each pillar's total and the total ODA and
OOF per context and year, the six largest providers per context and per tier, the climate
finance per context and each DAC member's change in 2025. Each pillar is a filter on the
pillar's purpose labels, then a sum by recipient and year; development is the total less
the other two. The CRS reads hold 16 recipients each, and DFO computes on one at a time, so
each figure takes one call per read, and the step joins the disjoint results. The step keeps
the small arithmetic: development, climate "both" as the total less adaptation and
mitigation, and the change joined to each provider. The page's browser read
(`_lib/live.ts`) runs the same recipes on DFO's newest stored data, with the labels, providers
and read groups the step writes to `live.json`.

Every read is pinned, and `refs.json` beside this file keeps each read's ref and provenance.
The step runs in one of three modes:

- plain, the default: fetch each committed ref, so the outputs reproduce byte for byte;
  provenance and the retrieval time come from `refs.json`;
- `--refresh`: fetch the newest versions of each committed ref, pin them and rewrite
  `refs.json`;
- `--search`: ask each question again, with one context as its example, fetch each reading
  for all 62 contexts, pin it and rewrite `refs.json`. A ref keeps its window and spec, so a
  change to either takes this mode.

`--no-pin`, with `--refresh` or `--search`, writes the outputs, pins nothing and leaves
`refs.json` as it is, for a trial run. Pins come out of a daily allowance.

Checks known values, failing loudly when one differs, then writes `profiles.json`,
`groups.json`, with the six largest providers of ODA in 2024 to all 62 contexts and to each
tier, and `live.json`. All money is in current US dollars.

`fragility-2026.tsv` is the OECD's data file behind its fragility chart, linked from the
OECD's multidimensional fragility dashboard
(https://gitvfd.github.io/states-of-fragility-snail/data-new.tsv), with columns iso3,
country, overall score, tier, the six dimension scores and each dimension's category
from 1 (most fragile) to 5.
"""

import argparse
import csv
import json
import logging
import math
import time
from collections import defaultdict
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from functools import cache
from pathlib import Path
from typing import Any, Literal

import dfo
from dfo.types import Recipe

log = logging.getLogger("fragility-finance")

HERE = Path(__file__).parent
CLASSIFICATION = HERE / "fragility-2026.tsv"
TARGET = HERE / "profiles.json"
GROUPS_TARGET = HERE / "groups.json"
REFS = HERE / "refs.json"
LIVE_TARGET = HERE / "live.json"

EXAMPLE = "Mozambique"
FLOW_YEARS = (2015, 2024)
DEBT_YEARS = (2015, 2033)
DONOR_YEAR = 2024
CLIMATE_YEAR = 2024
# The page draws each indicator's latest reading, which can be years old.
INDICATOR_YEARS = (2010, 2025)
# The page draws population in 2024 alone, beside that year's flows.
POPULATION_YEAR = 2024
# IDS reports debt service paid to 2025 and projects it on signed loans after that.
LAST_PAID_YEAR = 2025
# ONE Data's own climate method: each project's climate share (UNFCCC coefficients, else 40% of
# significant and 100% of principal markers), counted once under its higher marker. Without the
# facet the read returns the OECD's full-value weighting.
CLIMATE_METHOD = {"measurementMethod": "MarkerScoreWeightingHighestMarkerAssignment"}
TOP_DONORS = 6
# The CRS returns one row per provider, purpose, finance type and modality, so a build
# for all 62 recipients over 15 years runs in a few groups.
CRS_GROUP = 16
CRS_CHUNKS = 4
# DFO computes each figure in its own call. Its analysis door answers 503 past a few calls in
# flight, so two run at once.
ANALYSIS_CONCURRENCY = 2
PURPOSE = "crsPurpose"
PURPOSE_FILTER = "stat_var_crsPurpose"
PROVIDER = "financingProvider"
PLACE = "observationAbout"
EU_INSTITUTIONS = "EuropeanUnionInstitutions"
RECIPIENT = "financingRecipient"

DIMENSION_SCORES = {
    "eco": "Economic.PC1",
    "env": "Environmental.PC1",
    "hum": "Human.PC1",
    "pol": "Political.PC1",
    "sec": "Security.PC1",
    "soc": "Societal.PC1",
}

# The OECD's pillars, States of Fragility 2025, Annex A, Tables A.1 and A.2. Every other
# purpose code counts as development.
HUMANITARIAN = {72010, 72040, 72050, 73010, 74020}
PEACE = {
    # Core peace.
    15210, 15220, 15230, 15240, 15250, 15261,
    # Secondary peace.
    15110, 15111, 15112, 15113, 15130, 15150, 15152, 15153, 15160, 15170, 15180, 15190,
}  # fmt: skip
PILLARS = ("development", "humanitarian", "peace")

# Short names for the contexts the OECD's file names in ISO style.
NAMES = {
    "COD": "DR Congo",
    "SDN": "Sudan",
    "CAF": "Central African Republic",
    "SYR": "Syria",
    "COG": "Congo",
    "NER": "Niger",
    "COM": "Comoros",
    "VEN": "Venezuela",
    "LAO": "Laos",
    "TZA": "Tanzania",
    "PSE": "West Bank and Gaza",
    "PRK": "North Korea",
    "GMB": "The Gambia",
    "IRN": "Iran",
}

# Living-conditions indicators: the page's key, the question and the reading's unit.
INDICATORS = (
    ("stunting", "share of children under five who are stunted in Mozambique", "%"),
    ("water", "share of population using basic drinking water services in Mozambique", "%"),
    ("dtp3", "DTP3 immunisation coverage in Mozambique", "%"),
)  # fmt: skip
FLOW_SERIES = ("oda", "oof", "remittances", "fdi", "debtService")
GROUPS = {"all": ("extreme", "high"), "extreme": ("extreme",), "high": ("high",)}

# Debt service values read from DFO. A refetch that moves one fails the check, so a change
# in the source is seen before it reaches the page.
KNOWN = {
    ("MOZ", 2024): 916_663_899.7,
    ("MOZ", 2033): 462_640_455.4,
}
TOLERANCE = 0.01

type Mode = Literal["plain", "refresh", "search"]
type Rows = list[dict[str, Any]]
# A series' value in each year.
type Yearly = dict[int, float]


class Reads:
    """The step's DFO reads under one mode, and what `refs.json` records of each.

    Each read has a key in `refs.json`. A plain run fetches the committed ref and keeps
    the committed record. The other modes fetch anew, and `keep` pins every read once the
    checks pass and records it. With `pin` false, `keep` records the reads unpinned and
    `write` leaves `refs.json` alone, for a trial run.
    """

    def __init__(self, mode: Mode, *, pin: bool = True) -> None:
        self.mode = mode
        self.pin = pin
        self.committed = json.loads(REFS.read_text()) if mode != "search" else None
        self.fetched: dict[str, dfo.Dataset] = {}
        self.records: dict[str, dict] = {}
        self.rows: dict[str, int] = {}
        self.pins = 0

    def read(
        self,
        key: str,
        ask: Callable[[], dfo.Answer],
        *,
        role: str | None = None,
        places: Iterable[str] = (),
        window: tuple[int, int] | None = None,
        facets: dict[str, str] | None = None,
    ) -> dfo.Dataset:
        """Fetch read `key`: its committed ref, the ref's newest versions, or `ask()`'s
        answer for `places` under `role`."""
        if key in self.rows:
            raise SystemExit(f"{key}: read twice")

        if self.committed is None:
            options = {}

            if window is not None:
                options["window"] = window

            if facets is not None:
                options["facets"] = facets

            if role is not None:
                options["entities"] = {role: list(places)}

            data = ask().fetch(**options)
        else:
            if key not in self.committed["data"]:
                raise SystemExit(f"{key}: {REFS.name} holds no ref; run with --search")

            ref = dfo.DatasetRef.from_json(json.dumps(self.committed["data"][key]["ref"]))
            data = dfo.fetch(ref, latest=self.mode == "refresh")

        if self.mode == "plain":
            if not data.provenance.pinned:
                raise SystemExit(f"{key}: the committed ref names a version not pinned")

            self.records[key] = self.committed["data"][key]
        else:
            self.fetched[key] = data

        self.rows[key] = len(data)
        log.info("%s: %s rows, %s", key, f"{len(data):,}", data.sentence)
        return data

    def keep(self) -> None:
        """Pin each read fetched anew and record its ref and provenance."""
        for key, data in self.fetched.items():
            if self.pin:
                self.pins += sum(1 for member in data.members if not member.pinned)
                data = dfo.pin(data)

            self.records[key] = {
                "ref": json.loads(data.ref.to_json()),
                "provenance": json.loads(data.provenance.to_json()),
            }

    def retrieved(self) -> str:
        """The time of the run that pinned the reads, which a plain run copies."""
        if self.committed is not None and self.mode == "plain":
            return self.committed["provenance"]["retrieved"]

        return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")

    def summary(self, prefixes: tuple[str, ...] = ("",)) -> list[dict]:
        """Each read whose key starts with one of `prefixes`, as the outputs record it."""
        found = []

        for key, record in self.records.items():
            if not key.startswith(prefixes):
                continue

            provenance = dfo.Provenance.from_json(record["provenance"])
            found.append(
                {
                    "key": key,
                    "sentence": provenance.sentence,
                    "specIds": [member.spec.spec_id for member in provenance.members],
                    "versions": [member.content_version for member in provenance.members],
                    "citation": provenance.citation.text,
                    "rows": self.rows[key],
                    "warnings": sorted({notice.code for notice in provenance.warnings}),
                }
            )

        return found

    def write(self, retrieved: str) -> None:
        """Rewrite `refs.json`. A plain run and a trial run leave it as committed."""
        if self.mode == "plain" or not self.pin:
            return

        envelope = {
            "provenance": {
                "sdk": f"development-finance=={dfo.__version__}",
                "query": "fragility-finance pinned reads",
                "retrieved": retrieved,
            },
            "data": self.records,
        }
        REFS.write_text(json.dumps(envelope, indent=1, ensure_ascii=False) + "\n")
        log.info("Wrote %s; pinned %d new versions.", REFS, self.pins)


def read_classification() -> list[dict]:
    """The OECD's 62 contexts, most fragile first, with their dimension scores."""
    with CLASSIFICATION.open(newline="", encoding="utf-8") as file:
        rows = list(csv.DictReader(file, delimiter="\t"))

    rows.sort(key=lambda row: float(row["overall"]))
    contexts = [
        {
            "iso3": row["iso3"],
            "name": NAMES.get(row["iso3"], row["country"]),
            "tier": row["tier"],
            "score": round(float(row["overall"]), 2),
            "rank": rank,
            "dimensions": {
                key: {"score": round(float(row[column]), 2), "category": int(row[key])}
                for key, column in DIMENSION_SCORES.items()
            },
        }
        for rank, row in enumerate(rows, start=1)
    ]
    tiers = [context["tier"] for context in contexts]

    if len(contexts) != 62 or tiers.count("extreme") != 20 or tiers.count("high") != 42:
        raise SystemExit(
            f"{CLASSIFICATION.name}: expected 20 extreme and 42 high contexts, found "
            f"{tiers.count('extreme')} and {tiers.count('high')}."
        )

    return contexts


def asking(key: str, question: str | None = None, **search) -> Callable[[], dfo.Answer]:
    """A search run at most once, on the first call, failing unless every part of the
    answer has one reading. A plain run never calls it."""

    @cache
    def answer() -> dfo.Answer:
        found = dfo.search(question, **search) if question else dfo.search(**search)

        if not found.complete:
            raise SystemExit(f"{key}: the search has no single reading.\n{found}")

        log.info("%s: %s", key, found.sentence)
        return found

    return answer


def rows_of(data: dfo.Dataset) -> Rows:
    return data.to_arrow().to_pylist()


def by_place(rows: Rows, column: str) -> dict[str, Yearly]:
    """Each place's value in each year, summed over any other columns and keyed by ISO3 code.
    A year whose values are all null is left out."""
    places: dict[str, Yearly] = defaultdict(dict)

    for row in rows:
        value = row["value"]

        if value is None or math.isnan(value):
            continue

        values = places[str(row[column]).removeprefix("country/")]
        year = int(row["time_period"])
        values[year] = values.get(year, 0.0) + value

    return dict(places)


def joined(parts: Iterable[dict[str, Yearly]]) -> dict[str, Yearly]:
    """The results of the CRS reads in one map. Each read holds its own recipients."""
    found: dict[str, Yearly] = {}

    for part in parts:
        shared = found.keys() & part.keys()

        if shared:
            raise SystemExit(f"recipients in two CRS reads: {sorted(shared)}")

        found |= part

    return found


def money(value: float | None) -> int | None:
    return None if value is None else round(value)


def pillar(purpose: str) -> str:
    code = int(str(purpose).removeprefix("CRSPurposeCode"))

    if code in HUMANITARIAN:
        return "humanitarian"

    return "peace" if code in PEACE else "development"


def latest(values: Yearly | None) -> dict | None:
    if not values:
        return None

    year = max(values)
    return {"year": year, "value": round(values[year], 2)}


def labels_of(frames: Iterable[dfo.Dataset], column: str) -> dict[str, set[str]]:
    """Each code of `column` the frames hold, with the labels their cells give it."""
    labels: dict[str, set[str]] = defaultdict(set)

    for data in frames:
        pairs = data.to_arrow().group_by([column, f"{column}_label"]).aggregate([])

        for code, label in zip(
            pairs.column(column).to_pylist(),
            pairs.column(f"{column}_label").to_pylist(),
            strict=True,
        ):
            labels[str(code)].add(str(label))

    return labels


def pillar_purposes(aid: list[dfo.Dataset]) -> dict[str, list[str]]:
    """The labels of the humanitarian and peace purpose codes the CRS reads hold, which the
    pillars' filters match: DFO's cells hold a purpose's label, not its code.

    Fails unless each label names one purpose code of the reads, a code of its own pillar,
    since a label that named no code would filter to nothing and draw a zero pillar.
    """
    codes: dict[str, set[str]] = defaultdict(set)

    for code, labels in labels_of(aid, PURPOSE).items():
        for label in labels:
            codes[label].add(code)

    purposes = {}

    for name in ("humanitarian", "peace"):
        labels = sorted(
            label for label, held in codes.items() if any(pillar(code) == name for code in held)
        )
        problems = [
            f"{label!r} names {sorted(codes[label])}"
            for label in labels
            if len(codes[label]) != 1 or pillar(next(iter(codes[label]))) != name
        ]

        if not labels or problems:
            raise SystemExit(
                f"the {name} purpose labels do not each name one {name} code: "
                f"{'; '.join(problems) or 'none held'}"
            )

        purposes[name] = labels

    return purposes


def provider_names(aid: list[dfo.Dataset]) -> dict[str, str]:
    """Each provider of the CRS reads by code, with its label, which the page shows."""
    names = {}

    for code, labels in sorted(labels_of(aid, PROVIDER).items()):
        if len(labels) != 1:
            raise SystemExit(f"provider {code} has labels {sorted(labels)}")

        names[code] = next(iter(labels))

    return names


def crs_groups(places: list[str]) -> list[list[str]]:
    return [places[start : start + CRS_GROUP] for start in range(0, len(places), CRS_GROUP)]


def crs_reads(reads: Reads, key: str, ask: Callable[[], dfo.Answer], places: list[str]) -> dict:
    """The CRS reads of `key`, one per group of recipients, with the recipients of each."""
    groups = crs_groups(places)

    if len(groups) != CRS_CHUNKS:
        raise SystemExit(f"{key}: {len(groups)} groups of recipients, not {CRS_CHUNKS}")

    return {
        f"{key}-{index}": (
            reads.read(f"{key}-{index}", ask, role="destination", places=group, window=FLOW_YEARS),
            group,
        )
        for index, group in enumerate(groups, start=1)
    }


def figures(
    aid: dict[str, tuple[dfo.Dataset, list[str]]],
    oof: dict[str, dfo.Dataset],
    donors: dict[str, dfo.Dataset],
    climate: dict[str, dfo.Dataset],
    purposes: dict[str, list[str]],
    tiers: dict[str, str],
) -> dict[str, Recipe]:
    """The recipes DFO computes, by a key naming the read and the figure, such as
    `aid-1/humanitarian`. `_lib/live.ts`'s `recipes` builds the same ones."""
    recipe = dfo.analysis.recipe
    found: dict[str, Recipe] = {}

    for key, (data, group) in aid.items():
        found[f"{key}/total"] = recipe(data.ref).aggregate(by="destination")

        for name, labels in purposes.items():
            found[f"{key}/{name}"] = (
                recipe(data.ref).filter(keep={PURPOSE_FILTER: labels}).aggregate(by="destination")
            )

        found[f"{key}/donors"] = recipe(data.ref).rank(
            by="origin",
            per="destination",
            window=(DONOR_YEAR, DONOR_YEAR),
            how="sum",
            limit=TOP_DONORS,
        )
        held = {tiers[place] for place in group}

        for tier in sorted(held):
            start = recipe(data.ref)

            if len(held) > 1:
                start = start.filter(
                    keep={"destination": [place for place in group if tiers[place] == tier]}
                )

            found[f"{key}/{tier}"] = start.aggregate(by="origin")

    for key, data in oof.items():
        found[f"{key}/total"] = recipe(data.ref).aggregate(by="destination")

    for key, data in donors.items():
        found[f"{key}/change"] = recipe(data.ref).growth(
            by="origin", window=(DONOR_YEAR, DONOR_YEAR + 1)
        )

    for key, data in climate.items():
        found[f"{key}/total"] = recipe(data.ref).aggregate(by="destination")

    return found


def compute(recipes: dict[str, Recipe]) -> dict[str, Rows]:
    """Each recipe's rows, computed by DFO, `ANALYSIS_CONCURRENCY` at a time."""

    def run(key: str) -> Rows:
        start = time.monotonic()
        rows = rows_of(dfo.fetch(recipes[key]))
        log.info("%s: %d rows computed in %.1f s", key, len(rows), time.monotonic() - start)
        return rows

    with ThreadPoolExecutor(ANALYSIS_CONCURRENCY) as pool:
        return dict(zip(recipes, pool.map(run, recipes), strict=True))


def donor_change(results: dict[str, Rows]) -> dict[str, float]:
    """Each DAC member's change in total ODA from 2024 to 2025, as a fraction. DFO leaves
    out a provider with no ODA in 2024 or none recorded in 2025."""
    return {
        str(row[PROVIDER]): row["value"]
        for key in ("donors2025/change", "donors2025-eu/change")
        for row in results[key]
        if row["value"] is not None
    }


def largest(
    totals: dict[str, float], names: dict[str, str], change: dict[str, float]
) -> list[dict]:
    """The `TOP_DONORS` largest providers of `totals`, those above zero, largest first."""
    ranked = sorted(totals.items(), key=lambda item: item[1], reverse=True)[:TOP_DONORS]
    return [
        {
            "name": names[provider],
            "value": money(value),
            "change2025": round(change[provider], 4) if provider in change else None,
        }
        for provider, value in ranked
        if value > 0
    ]


def context_donors(
    results: dict[str, Rows], names: dict[str, str], change: dict[str, float]
) -> dict[str, list[dict]]:
    """Each context's six largest providers in 2024, from DFO's ranking per recipient."""
    totals: dict[str, dict[str, float]] = defaultdict(dict)

    for index in range(1, CRS_CHUNKS + 1):
        for row in results[f"aid-{index}/donors"]:
            if row["value"] is not None:
                iso3 = str(row[RECIPIENT]).removeprefix("country/")
                totals[iso3][str(row[PROVIDER])] = row["value"]

    return {iso3: largest(values, names, change) for iso3, values in totals.items()}


def group_donors(
    results: dict[str, Rows], names: dict[str, str], change: dict[str, float]
) -> dict[str, dict]:
    """The six largest providers of ODA in 2024 to all 62 contexts and to each tier, from
    DFO's sum by provider over each read's contexts of a tier."""
    by_tier: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))

    for key, rows in results.items():
        read, _, tier = key.partition("/")

        if not read.startswith("aid-") or tier not in ("extreme", "high"):
            continue

        for row in rows:
            if row["value"] is not None and int(row["time_period"]) == DONOR_YEAR:
                by_tier[tier][str(row[PROVIDER])] += row["value"]

    groups = {}

    for key, tiers in GROUPS.items():
        totals: dict[str, float] = defaultdict(float)

        for tier in tiers:
            for provider, value in by_tier[tier].items():
                totals[provider] += value

        groups[key] = {"donors": largest(totals, names, change)}

    return groups


def climate_split(iso3: str, total: dict, adaptation: dict, mitigation: dict) -> dict | None:
    """Climate finance in 2024 split into adaptation only, mitigation only and both.

    Null where none is recorded in 2024. Fails if any part is negative, which would mean
    the adaptation and mitigation series overlap or exceed the total.
    """
    if total.get(CLIMATE_YEAR, 0.0) <= 0:
        return None

    only_adaptation = adaptation.get(CLIMATE_YEAR, 0.0)
    only_mitigation = mitigation.get(CLIMATE_YEAR, 0.0)
    split = {
        "adaptation": money(only_adaptation),
        "mitigation": money(only_mitigation),
        "both": money(total[CLIMATE_YEAR] - only_adaptation - only_mitigation),
    }
    negative = {part: value for part, value in split.items() if value < 0}

    if negative:
        raise SystemExit(f"climate finance {iso3} {CLIMATE_YEAR}: negative parts {negative}")

    return {"year": CLIMATE_YEAR, **split}


def log_panels(contexts: list[dict]) -> None:
    """Log each flow's 2024 sum over every context holding it and over a balanced panel.

    The balanced panel is the contexts that hold the series in all ten years, 2015 to
    2024, so a group sum over it moves only with the money.
    """
    last = FLOW_YEARS[1]
    years = range(FLOW_YEARS[0], last + 1)

    for series in FLOW_SERIES:
        held = [
            {row["year"]: row[series] for row in context["flows"] if row[series] is not None}
            for context in contexts
        ]
        every = [values[last] for values in held if last in values]
        balanced = [values[last] for values in held if all(year in values for year in years)]
        total, panel = sum(every), sum(balanced)
        lost = 1 - panel / total if total else 0.0
        log.info(
            "%s %d: %d contexts hold it, $%.2fbn; %d hold all of %d to %d, $%.2fbn; %.1f%% lost.",
            series,
            last,
            len(every),
            total / 1e9,
            len(balanced),
            FLOW_YEARS[0],
            last,
            panel / 1e9,
            100 * lost,
        )


def parse_arguments() -> tuple[Mode, bool]:
    """The mode, and whether to pin what a refresh or a search fetches."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--refresh", action="store_true", help="pin the newest versions of the committed refs"
    )
    group.add_argument(
        "--search", action="store_true", help="search again and pin what the answers build"
    )
    parser.add_argument(
        "--no-pin",
        action="store_true",
        help="with --refresh or --search, write the outputs but pin nothing and keep refs.json",
    )
    arguments = parser.parse_args()
    mode: Mode = "refresh" if arguments.refresh else "search" if arguments.search else "plain"

    if arguments.no_pin and mode == "plain":
        parser.error("--no-pin needs --refresh or --search")

    return mode, not arguments.no_pin


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    mode, pin = parse_arguments()
    reads = Reads(mode, pin=pin)
    contexts = read_classification()
    places = [f"country/{context['iso3']}" for context in contexts]
    tiers = {f"country/{context['iso3']}": context["tier"] for context in contexts}

    def place_reading(key: str, question: str, window: tuple[int, int]) -> dict[str, Yearly]:
        data = reads.read(key, asking(key, question), role="place", places=places, window=window)
        return by_place(rows_of(data), PLACE)

    def recipient_reading(
        key: str, window: tuple[int, int], facets: dict[str, str] | None = None, **search
    ) -> dfo.Dataset:
        ask = asking(key, **search)
        data = reads.read(key, ask, role="destination", places=places, window=window, facets=facets)
        table = data.to_arrow()
        for column, value in (facets or {}).items():
            held = set(table.column(column).drop_null().unique().to_pylist())
            if held != {value}:
                raise SystemExit(f"{key}: expected {column} {value}, got {sorted(held)}")
        return data

    aid = crs_reads(reads, "aid", asking("aid", f"ODA to {EXAMPLE} by sector"), places)
    oof = crs_reads(
        reads,
        "oof",
        asking("oof", f"gross other official flows (OOF) disbursements to {EXAMPLE}"),
        places,
    )
    # DFO's DAC members group holds the 32 member countries and leaves out EU institutions,
    # also a DAC member. A question naming EU institutions resolves to the EU's members or to
    # the EU as a recipient, so the EU is read from the same answer, named as the origin.
    # Its DAC1 code, EuropeanUnionInstitutions, is the provider code the CRS uses.
    ask_donors = asking("donors2025", "total ODA of each DAC donor in 2024 and 2025")
    donors = {
        "donors2025": reads.read("donors2025", ask_donors),
        "donors2025-eu": reads.read(
            "donors2025-eu", ask_donors, role="origin", places=[EU_INSTITUTIONS]
        ),
    }
    remittances = place_reading(
        "remittances", f"inward remittances to {EXAMPLE} in US dollars", FLOW_YEARS
    )
    fdi = place_reading("fdi", f"foreign direct investment inflows to {EXAMPLE}", FLOW_YEARS)
    debt = by_place(
        rows_of(recipient_reading("debtService", DEBT_YEARS, codes=["DT.TDS.DPPG.CD"])),
        RECIPIENT,
    )
    climate_window = (CLIMATE_YEAR, CLIMATE_YEAR)
    climate_reads = {
        f"climate-{objective}": recipient_reading(
            f"climate-{objective}", climate_window, facets=CLIMATE_METHOD, question=question
        )
        for objective, question in (
            ("total", f"climate finance to {EXAMPLE}"),
            ("adaptation", f"climate adaptation finance to {EXAMPLE}"),
            ("mitigation", f"climate mitigation finance to {EXAMPLE}"),
        )
    }
    population = place_reading(
        "population", f"population of {EXAMPLE}", (POPULATION_YEAR, POPULATION_YEAR)
    )
    indicators = {
        key: place_reading(key, question, INDICATOR_YEARS) for key, question, _ in INDICATORS
    }

    aid_frames = [data for data, _ in aid.values()]
    purposes = pillar_purposes(aid_frames)
    names = provider_names(aid_frames)
    results = compute(
        figures(
            aid,
            {key: data for key, (data, _) in oof.items()},
            donors,
            climate_reads,
            purposes,
            tiers,
        )
    )

    def summed(read: str, figure: str) -> dict[str, Yearly]:
        return joined(
            by_place(results[f"{read}-{index}/{figure}"], RECIPIENT)
            for index in range(1, CRS_CHUNKS + 1)
        )

    totals = summed("aid", "total")
    pillars = {name: summed("aid", name) for name in purposes}
    official_flows = summed("oof", "total")
    climate = {key: by_place(results[f"{key}/total"], RECIPIENT) for key in climate_reads}
    change = donor_change(results)
    donors_of = context_donors(results, names, change)

    for context in contexts:
        iso3 = context["iso3"]
        oda = totals.get(iso3, {})
        humanitarian = pillars["humanitarian"].get(iso3, {})
        peace = pillars["peace"].get(iso3, {})
        context["pillars"] = [
            {
                "year": year,
                "development": money(
                    oda[year] - humanitarian.get(year, 0.0) - peace.get(year, 0.0)
                ),
                "humanitarian": money(humanitarian.get(year, 0.0)),
                "peace": money(peace.get(year, 0.0)),
            }
            for year in sorted(oda)
        ]

        official = official_flows.get(iso3, {})
        remitted, invested = remittances.get(iso3, {}), fdi.get(iso3, {})
        serviced = debt.get(iso3, {})
        context["flows"] = [
            {
                "year": year,
                "oda": money(oda.get(year)),
                "oof": money(official.get(year, 0.0)),
                "remittances": money(remitted.get(year)),
                "fdi": money(invested.get(year)),
                "debtService": money(serviced.get(year)),
            }
            for year in range(FLOW_YEARS[0], FLOW_YEARS[1] + 1)
        ]
        context["debtService"] = [
            {"year": year, "value": money(value), "projected": year > LAST_PAID_YEAR}
            for year, value in sorted(serviced.items())
        ]
        context["donors"] = donors_of.get(iso3, [])
        context["climate"] = climate_split(
            iso3, *(climate[key].get(iso3, {}) for key in climate_reads)
        )
        context["population"] = {
            str(year): money(value) for year, value in sorted(population.get(iso3, {}).items())
        }
        context["indicators"] = {key: latest(indicators[key].get(iso3)) for key, _, _ in INDICATORS}

    groups = group_donors(results, names, change)
    check(contexts, groups)
    log_panels(contexts)
    reads.keep()

    retrieved = reads.retrieved()
    every_read = reads.summary()
    envelope = {
        "provenance": {
            "sdk": f"development-finance=={dfo.__version__}",
            "query": (
                "For each of the OECD's 62 fragile contexts in 2026: gross ODA disbursements "
                "by purpose and provider and gross OOF disbursements (OECD CRS), DAC members' "
                "total ODA in 2024 and 2025 (OECD DAC1), inward remittances (WDI), FDI inflows "
                "(SDG database), public external debt service (World Bank IDS), climate finance "
                "(ONE Data), "
                "population (UNICEF) and three living-conditions indicators (SDG database)"
            ),
            "retrieved": retrieved,
            "citation": "; ".join(sorted({read["citation"] for read in every_read})),
            "classification": "OECD, States of Fragility 2026 update",
            "units": {key: unit for key, _, unit in INDICATORS},
            "dfo": every_read,
        },
        "data": contexts,
    }
    donor_reads = reads.summary(("aid-", "donors2025"))
    group_envelope = {
        "provenance": {
            "sdk": envelope["provenance"]["sdk"],
            "query": (
                "The six largest providers of gross ODA disbursements in 2024 (OECD CRS) to "
                "the OECD's 62 fragile contexts in 2026, to the 20 in extreme fragility and to "
                "the 42 in high fragility, with each provider's change in total ODA from 2024 "
                "to 2025 (OECD DAC1)"
            ),
            "retrieved": retrieved,
            "citation": "; ".join(sorted({read["citation"] for read in donor_reads})),
            "classification": envelope["provenance"]["classification"],
            "dfo": donor_reads,
        },
        "data": groups,
    }

    live_envelope = {
        "provenance": {
            "sdk": envelope["provenance"]["sdk"],
            "query": (
                "What the page's browser read needs beside refs.json to run the step's "
                "recipes: the recipients of each CRS read, the labels of the humanitarian and "
                "peace purpose codes the reads hold, and each CRS provider's label"
            ),
            "retrieved": retrieved,
        },
        "data": {
            "groups": {key: group for key, (_, group) in aid.items()},
            "purposes": purposes,
            "providers": names,
        },
    }

    reads.write(retrieved)

    for target, content in (
        (TARGET, envelope),
        (GROUPS_TARGET, group_envelope),
        (LIVE_TARGET, live_envelope),
    ):
        target.write_text(json.dumps(content, indent=1, ensure_ascii=False) + "\n")
        log.info("Wrote %s.", target)

    return 0


def check(contexts: list[dict], groups: dict[str, dict]) -> None:
    """Fail on a known value that moved, coverage far below what DFO holds, or group donors
    that do not fit inside the ODA they are drawn from."""
    found = {context["iso3"]: context for context in contexts}
    problems = []

    for (iso3, year), expected in KNOWN.items():
        values = {row["year"]: row["value"] for row in found[iso3]["debtService"]}
        value = values.get(year)

        if value is None or abs(value - expected) > TOLERANCE * expected:
            problems.append(f"debt service {iso3} {year}: expected {expected:,.0f}, found {value}")

    with_aid = sum(1 for context in contexts if context["pillars"])
    with_debt = sum(1 for context in contexts if context["debtService"])
    with_people = sum(1 for context in contexts if context["population"])

    if with_aid < 60:
        problems.append(f"only {with_aid} of 62 contexts have CRS aid")

    if with_debt < 45:
        problems.append(f"only {with_debt} of 62 contexts have IDS debt service")

    if with_people < 60:
        problems.append(f"only {with_people} of 62 contexts have population")

    for key, group in groups.items():
        if len(group["donors"]) != TOP_DONORS:
            problems.append(f"group {key} has {len(group['donors'])} donors, not {TOP_DONORS}")

    oda = sum(
        row["oda"] or 0
        for context in contexts
        for row in context["flows"]
        if row["year"] == DONOR_YEAR
    )
    donated = sum(donor["value"] for donor in groups["all"]["donors"])

    if donated > oda:
        problems.append(
            f"the six largest donors give {donated:,} of only {oda:,} ODA in {DONOR_YEAR}"
        )

    oof = {
        context["name"]: row["oof"]
        for context in contexts
        for row in context["flows"]
        if row["year"] == DONOR_YEAR
    }
    oof_total, with_oof = sum(oof.values()), sum(1 for value in oof.values() if value > 0)

    if not 15e9 < oof_total < 20e9 or with_oof < 50:
        problems.append(
            f"OOF in {DONOR_YEAR} is {oof_total:,} across {with_oof} contexts; "
            "expected about $17.3bn across 55"
        )

    with_climate = sum(1 for context in contexts if context["climate"])

    if problems:
        raise SystemExit("Checks failed:\n  " + "\n  ".join(problems))

    log.info(
        "Checks passed: %d contexts with aid, %d with debt service, %d with population, "
        "%d with climate finance in %d; OOF in %d $%.2fbn, above zero in %d contexts.",
        with_aid,
        with_debt,
        with_people,
        with_climate,
        CLIMATE_YEAR,
        DONOR_YEAR,
        oof_total / 1e9,
        with_oof,
    )


if __name__ == "__main__":
    raise SystemExit(main())
