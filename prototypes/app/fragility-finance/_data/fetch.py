# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["development-finance[pandas]==0.3.0"]
# ///
"""The fragility-finance data step, run by hand with `pnpm data fragility-finance`.

Reads the OECD's 2026 fragility classification from `fragility-2026.tsv` and fetches,
for each of its 62 contexts, the money that reaches it and the money it pays out:

- gross ODA disbursements from the OECD CRS, 2010 to 2024, split into the OECD's
  humanitarian, development and peace pillars by purpose code, and by provider in 2024;
- each DAC member's total ODA in 2024 and 2025 from DAC1, for the change in 2025;
- gross other official flows (OOF) disbursements from the OECD CRS, 2015 to 2024, zero in a
  year with none recorded, since the CRS records every OOF its reporters disburse;
- inward remittances (WDI) and FDI inflows (SDG database), 2015 to 2024;
- public external debt service from World Bank IDS, 2015 to 2033, projected after 2025;
- climate finance received from ONE Data in 2024 under ONE's own method, for adaptation,
  mitigation and both;
- population (UNICEF) and three living-conditions indicators (SDG database), latest year.

Each search runs once, with one context as its example, and each reading is then
fetched for all 62 contexts. Checks known values, failing loudly when one differs, then
writes `profiles.json` beside this file, and `groups.json` with the six largest providers
of ODA in 2024 to all 62 contexts and to each tier. All money is in current US dollars.

`fragility-2026.tsv` is the OECD's data file behind its fragility chart, linked from the
OECD's multidimensional fragility dashboard
(https://gitvfd.github.io/states-of-fragility-snail/data-new.tsv), with columns iso3,
country, overall score, tier, the six dimension scores and each dimension's category
from 1 (most fragile) to 5.
"""

import csv
import json
import logging
import warnings
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path

import dfo
import pandas as pd

log = logging.getLogger("fragility-finance")

HERE = Path(__file__).parent
CLASSIFICATION = HERE / "fragility-2026.tsv"
TARGET = HERE / "profiles.json"
GROUPS_TARGET = HERE / "groups.json"

EXAMPLE = "Mozambique"
AID_YEARS = (2010, 2024)
FLOW_YEARS = (2015, 2024)
DEBT_YEARS = (2015, 2033)
DONOR_YEAR = 2024
CLIMATE_YEAR = 2024
INDICATOR_YEARS = (2010, 2025)
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

# Values read from DFO when this step was written. A refetch that moves one fails here,
# so a change in the source is seen before it reaches the page.
KNOWN = {
    ("MOZ", 2024): 916_663_899.7,
    ("MOZ", 2033): 462_640_455.4,
}
TOLERANCE = 0.01

READS: list[dict] = []


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


def answer_for(key: str, question: str | None = None, **search) -> dfo.Answer:
    """Search once and fail unless every part of the answer has one reading."""
    answer = dfo.search(question, **search) if question else dfo.search(**search)

    if not answer.complete:
        raise SystemExit(f"{key}: the search has no single reading.\n{answer}")

    log.info("%s: %s", key, answer.sentence)
    return answer


def fetch(
    key: str,
    answer: dfo.Answer,
    *,
    role: str | None = None,
    places: Iterable[str] = (),
    window: tuple[int, int] | None = None,
    facets: dict[str, str] | None = None,
) -> pd.DataFrame:
    """Fetch every reading of `answer`, for `places` under `role`, recording what was read."""
    options = {}

    if window is not None:
        options["window"] = window

    if facets is not None:
        options["facets"] = facets

    if role is not None:
        options["entities"] = {role: list(places)}

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        data = answer.fetch(**options)

    READS.append(
        {
            "key": key,
            "sentence": data.sentence,
            "specIds": [spec.spec_id for spec in answer.specs],
            "versions": [member.content_version for member in data.members],
            "citation": data.citation.text,
            "rows": len(data),
            "warnings": sorted({str(warning.message).splitlines()[0] for warning in caught}),
        }
    )
    return data.to_pandas()


def by_place(frame: pd.DataFrame, column: str) -> dict[str, pd.DataFrame]:
    """Split a frame by its place column, keyed by ISO3 code."""
    return {
        str(dcid).removeprefix("country/"): rows for dcid, rows in frame.groupby(column, sort=False)
    }


def yearly(rows: pd.DataFrame | None) -> dict[int, float]:
    """A series' value in each year, summed over any other columns."""
    if rows is None or rows.empty:
        return {}

    totals = rows.groupby(rows["time_period"].astype(int))["value"].sum(min_count=1)
    return {int(year): float(value) for year, value in totals.items() if pd.notna(value)}


def money(value: float | None) -> int | None:
    return None if value is None else round(value)


def pillar(purpose: str) -> str:
    code = int(str(purpose).removeprefix("CRSPurposeCode"))

    if code in HUMANITARIAN:
        return "humanitarian"

    return "peace" if code in PEACE else "development"


def latest(rows: pd.DataFrame | None) -> dict | None:
    values = yearly(rows)

    if not values:
        return None

    year = max(values)
    return {"year": year, "value": round(values[year], 2)}


def fetch_aid(places: list[str]) -> dict[str, pd.DataFrame]:
    answer = answer_for("aid", f"ODA to {EXAMPLE} by sector")
    aid = pd.concat(
        [
            fetch("aid", answer, role="destination", places=group, window=AID_YEARS)
            for group in crs_groups(places)
        ],
        ignore_index=True,
    )
    aid["pillar"] = aid["crsPurpose"].map(pillar)
    aid["year"] = aid["time_period"].astype(int)
    return by_place(aid, RECIPIENT)


def crs_groups(places: list[str]) -> list[list[str]]:
    return [places[start : start + CRS_GROUP] for start in range(0, len(places), CRS_GROUP)]


def fetch_oof(places: list[str]) -> dict[str, pd.DataFrame]:
    answer = answer_for("oof", f"gross other official flows (OOF) disbursements to {EXAMPLE}")
    oof = pd.concat(
        [
            fetch("oof", answer, role="destination", places=group, window=FLOW_YEARS)
            for group in crs_groups(places)
        ],
        ignore_index=True,
    )
    return by_place(oof, RECIPIENT)


def donor_change() -> dict[str, float]:
    """Each DAC member's change in total ODA from 2024 to 2025, as a fraction."""
    question = "total ODA of each DAC donor in 2024 and 2025"
    answer = answer_for("donors2025", question)
    # DFO's DAC members group holds the 32 member countries and leaves out EU institutions,
    # also a DAC member. A question naming EU institutions resolves to the EU's members or to
    # the EU as a recipient, so the EU is read from the same answer, named as the origin.
    # Its DAC1 code, EuropeanUnionInstitutions, is the provider code the CRS uses.
    frame = pd.concat(
        [
            fetch("donors2025", answer),
            fetch("donors2025-eu", answer, role="origin", places=[EU_INSTITUTIONS]),
        ],
        ignore_index=True,
    )
    change = {}

    for provider, rows in frame.groupby("financingProvider"):
        values = yearly(rows)

        if values.get(2024) and 2025 in values:
            change[str(provider)] = values[2025] / values[2024] - 1

    return change


def top_donors(rows: pd.DataFrame | None, change: dict[str, float]) -> list[dict]:
    if rows is None:
        return []

    last = rows[rows["year"] == DONOR_YEAR]
    totals = (
        last.groupby(["financingProvider", "financingProvider_label"])["value"]
        .sum()
        .sort_values(ascending=False)
    )
    return [
        {
            "name": str(label),
            "value": money(value),
            "change2025": round(change[provider], 4) if provider in change else None,
        }
        for (provider, label), value in totals.head(TOP_DONORS).items()
        if value > 0
    ]


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


def group_donors(
    contexts: list[dict], aid: dict[str, pd.DataFrame], change: dict[str, float]
) -> dict[str, dict]:
    """The six largest providers of ODA in 2024 to all 62 contexts and to each tier."""
    groups = {}

    for key, tiers in GROUPS.items():
        frames = [
            aid[context["iso3"]]
            for context in contexts
            if context["tier"] in tiers and context["iso3"] in aid
        ]
        groups[key] = {"donors": top_donors(pd.concat(frames, ignore_index=True), change)}

    return groups


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


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    contexts = read_classification()
    places = [f"country/{context['iso3']}" for context in contexts]

    def place_reading(key: str, question: str, window: tuple[int, int]) -> dict:
        frame = fetch(key, answer_for(key, question), role="place", places=places, window=window)
        return by_place(frame, PLACE)

    def recipient_reading(
        key: str, window: tuple[int, int], facets: dict[str, str] | None = None, **search
    ) -> dict:
        answer = answer_for(key, **search)
        frame = fetch(key, answer, role="destination", places=places, window=window, facets=facets)
        for column, value in (facets or {}).items():
            held = set(frame[column].dropna().unique())
            if held != {value}:
                raise SystemExit(f"{key}: expected {column} {value}, got {sorted(held)}")
        return by_place(frame, RECIPIENT)

    aid = fetch_aid(places)
    oof = fetch_oof(places)
    change = donor_change()
    remittances = place_reading(
        "remittances", f"inward remittances to {EXAMPLE} in US dollars", FLOW_YEARS
    )
    fdi = place_reading("fdi", f"foreign direct investment inflows to {EXAMPLE}", FLOW_YEARS)
    debt = recipient_reading("debtService", DEBT_YEARS, codes=["DT.TDS.DPPG.CD"])
    climate_window = (CLIMATE_YEAR, CLIMATE_YEAR)
    climate = {
        objective: recipient_reading(
            f"climate-{objective}", climate_window, facets=CLIMATE_METHOD, question=question
        )
        for objective, question in (
            ("total", f"climate finance to {EXAMPLE}"),
            ("adaptation", f"climate adaptation finance to {EXAMPLE}"),
            ("mitigation", f"climate mitigation finance to {EXAMPLE}"),
        )
    }
    population = place_reading(
        "population", f"population of {EXAMPLE}", (FLOW_YEARS[0], INDICATOR_YEARS[1])
    )
    indicators = {
        key: place_reading(key, question, INDICATOR_YEARS) for key, question, _ in INDICATORS
    }

    for context in contexts:
        iso3 = context["iso3"]
        rows = aid.get(iso3)
        oda = yearly(rows)
        by_pillar = {
            name: yearly(None if rows is None else rows[rows["pillar"] == name]) for name in PILLARS
        }
        context["pillars"] = [
            {"year": year, **{name: money(by_pillar[name].get(year, 0.0)) for name in PILLARS}}
            for year in sorted(oda)
        ]

        official = yearly(oof.get(iso3))
        remitted, invested = yearly(remittances.get(iso3)), yearly(fdi.get(iso3))
        serviced = yearly(debt.get(iso3))
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
        context["donors"] = top_donors(rows, change)
        context["climate"] = climate_split(
            iso3, *(yearly(climate[objective].get(iso3)) for objective in climate)
        )
        context["population"] = {
            str(year): money(value) for year, value in sorted(yearly(population.get(iso3)).items())
        }
        context["indicators"] = {key: latest(indicators[key].get(iso3)) for key, _, _ in INDICATORS}

    groups = group_donors(contexts, aid, change)
    check(contexts, groups)
    log_panels(contexts)

    retrieved = datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
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
            "citation": "; ".join(sorted({read["citation"] for read in READS})),
            "classification": "OECD, States of Fragility 2026 update",
            "units": {key: unit for key, _, unit in INDICATORS},
            "dfo": READS,
        },
        "data": contexts,
    }
    donor_reads = [read for read in READS if read["key"].startswith(("aid", "donors2025"))]
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

    for target, content in ((TARGET, envelope), (GROUPS_TARGET, group_envelope)):
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
