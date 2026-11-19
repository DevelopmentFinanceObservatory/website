# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["development-finance[pandas]==0.3.0"]
# ///
"""The hiv-financing data step, run by hand with `pnpm data hiv-financing`.

Fetches, for 2015 to 2024:

- gross ODA disbursements from the OECD CRS under purpose code 13040 (HIV/AIDS), by
  provider and recipient, in current US dollars. Each provider counts as the United
  States, the Global Fund or other. Money to a recipient country is allocated; money to
  a region or to no country is unallocated;
- UNAIDS estimates of people living with HIV and antiretroviral therapy coverage, for
  every country;
- UNAIDS estimates of AIDS-related deaths, fetched for the same countries in groups,
  because a search for the phrase without a place matches OECD regional data.

Checks known values, failing loudly when one differs, then writes `hiv.json` beside this
file. The page covers aid recipients, so a country is kept only when it appears as a CRS
recipient of HIV aid in some year of the window, which leaves out donors such as Germany
that have UNAIDS estimates but never receive HIV aid. Of those, it is kept when it received
$1m or more in the last year or has 50,000 or more people living with HIV.
"""

import json
import logging
import warnings
from datetime import UTC, datetime
from pathlib import Path

import dfo
import pandas as pd

log = logging.getLogger("hiv-financing")

TARGET = Path(__file__).with_name("hiv.json")

YEARS = list(range(2015, 2025))
WINDOW = (YEARS[0], YEARS[-1])
LAST_YEAR = YEARS[-1]
PROVIDERS = ("us", "globalFund", "other")
MIN_AID = 1_000_000
MIN_PLHIV = 50_000
# UNAIDS reads cover about 190 countries; the deaths read takes them in groups.
DEATHS_GROUP = 30
COUNTRY = "country/"

AID_QUESTION = "HIV/AIDS aid by donor and recipient, 2015 to 2024"
PLHIV_QUESTION = "people living with HIV, 2015 to 2024"
ART_QUESTION = "coverage of antiretroviral therapy among people living with HIV, 2015 to 2024"
# Any country works as the example. A question naming no place matches OECD regional data.
DEATHS_QUESTION = "AIDS deaths in Kenya"

# The DFO's provenance pages, by the provenance id the data carries. UNAIDS has none.
PROVENANCE_PAGES = {
    "provenance/OECDCreditorReportingSystem": (
        "https://developmentfinance.org/data/sources/provenance/OECDCreditorReportingSystem"
    ),
}

# The names the page prints, where the DFO's label is dated or clumsy.
NAMES = {
    "CIV": "Côte d'Ivoire",
    "COD": "DR Congo",
    "MMR": "Myanmar",
    "SWZ": "Eswatini",
}

# Values read from DFO when this step was written. A refetch that moves one fails here,
# so a change in the source is seen before it reaches the page.
KNOWN_RECIPIENTS = 113
# (what, value, expected, tolerance as a fraction)
KNOWN_MONEY = {
    "allocated aid 2024": (6.38e9, 0.02),
    "unallocated aid 2024": (4.24e9, 0.02),
    "US unallocated aid 2023": (0.6e9, 0.05),
    "US unallocated aid 2024": (4.1e9, 0.05),
}
KNOWN_KENYA = {
    "AIDS deaths 2015": (36_400, 0.05),
    "AIDS deaths 2024": (20_800, 0.05),
    # A percentage, so a fraction such as 0.87 fails.
    "ART coverage 2024": (87, 0.02),
}

READS: list[dict] = []


def fetch(key: str, answer: dfo.Answer, **options) -> pd.DataFrame:
    """Fetch every reading of `answer`, recording what was read."""
    if not answer.complete:
        raise SystemExit(f"{key}: the search has no single reading.\n{answer}")

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        data = answer.fetch(window=WINDOW, **options)

    frame = data.to_pandas()
    provenance = str(frame["provenance"].iloc[0])
    READS.append(
        {
            "key": key,
            "sentence": data.sentence,
            "specIds": [spec.spec_id for spec in answer.specs],
            "versions": [member.content_version for member in data.members],
            "citation": data.citation.text,
            "rows": len(data),
            "page": PROVENANCE_PAGES.get(provenance),
            "warnings": sorted({str(warning.message).splitlines()[0] for warning in caught}),
        }
    )
    log.info("%s: %s (%d rows)", key, data.sentence, len(data))
    return frame


def provider_key(label: str) -> str:
    """The Global Fund counts as a provider, so donors' contributions to it count there."""
    if label.startswith("United States"):
        return "us"

    return "globalFund" if label == "Global Fund" else "other"


def provider_series(rows: pd.DataFrame) -> dict[str, list[int]]:
    """Money by provider key and year, one value per year, 0 where none is recorded."""
    totals = rows.groupby(["provider", rows["time_period"].astype(int)])["value"].sum()
    return {
        key: [round(float(totals.get((key, year), 0.0))) for year in YEARS] for key in PROVIDERS
    }


def read_aid() -> pd.DataFrame:
    frame = fetch("aid", dfo.search(AID_QUESTION))
    frame["provider"] = frame["financingProvider_label"].map(provider_key)
    return frame


def read_unaids(key: str, question: str, **options) -> pd.DataFrame:
    frame = fetch(key, dfo.search(question), **options)
    return frame[frame["observationAbout"].str.startswith(COUNTRY)]


def read_deaths(places: list[str]) -> pd.DataFrame:
    answer = dfo.search(DEATHS_QUESTION)
    frames = [
        fetch(
            f"deaths-{start // DEATHS_GROUP + 1}",
            answer,
            entities={"place": places[start : start + DEATHS_GROUP]},
        )
        for start in range(0, len(places), DEATHS_GROUP)
    ]
    return pd.concat(frames, ignore_index=True)


def yearly(frame: pd.DataFrame, place: str) -> dict[int, float]:
    rows = frame[frame["observationAbout"] == place]
    return {
        int(year): float(value)
        for year, value in zip(rows["time_period"], rows["value"], strict=True)
    }


def build(aid: pd.DataFrame, plhiv: pd.DataFrame, art: pd.DataFrame, deaths: pd.DataFrame) -> dict:
    allocated_mask = aid["financingRecipient"].str.startswith(COUNTRY, na=False)
    allocated, unallocated = aid[allocated_mask], aid[~allocated_mask]
    recipients = {
        str(place): str(label)
        for place, label in allocated.groupby("financingRecipient")["financingRecipient_label"]
        .first()
        .items()
    }
    for place in sorted(set(plhiv["observationAbout"]) - set(recipients)):
        people = yearly(plhiv, str(place)).get(LAST_YEAR) or 0

        if people >= MIN_PLHIV:
            log.info(
                "Left out, never a CRS recipient: %s, %s people living with HIV",
                place,
                f"{people:,.0f}",
            )

    last_year_aid = (
        allocated[allocated["time_period"].astype(int) == LAST_YEAR]
        .groupby("financingRecipient")["value"]
        .sum()
    )
    countries = []

    for place, label in recipients.items():
        iso3 = place.removeprefix(COUNTRY)
        rows = allocated[allocated["financingRecipient"] == place]
        people, coverage = yearly(plhiv, place), yearly(art, place)
        died = yearly(deaths, place)
        series = (
            provider_series(rows) if len(rows) else {key: [0] * len(YEARS) for key in PROVIDERS}
        )
        last = sum(values[-1] for values in series.values())

        if last < MIN_AID and (people.get(LAST_YEAR) or 0) < MIN_PLHIV:
            continue

        countries.append(
            {
                "iso3": iso3,
                "name": NAMES.get(iso3, label),
                "aid": series,
                "plhiv": round(people[LAST_YEAR]) if LAST_YEAR in people else None,
                "art": round(coverage[LAST_YEAR], 1) if LAST_YEAR in coverage else None,
                "deaths": [round(died[year]) if year in died else None for year in YEARS],
            }
        )

    countries.sort(key=lambda country: -sum(values[-1] for values in country["aid"].values()))
    return {
        "years": YEARS,
        "allocated": provider_series(allocated),
        "unallocated": provider_series(unallocated),
        "recipients": int((last_year_aid.round() > 0).sum()),
        "countries": countries,
    }


def close(value: float | None, expected: float, tolerance: float) -> bool:
    return value is not None and abs(value - expected) <= tolerance * expected


def check(data: dict) -> None:
    """Fail on a known value that moved, a missing provider or a series of the wrong length."""
    problems = []
    kenya = next((country for country in data["countries"] if country["iso3"] == "KEN"), None)
    found = {
        "AIDS deaths 2015": kenya and kenya["deaths"][0],
        "AIDS deaths 2024": kenya and kenya["deaths"][-1],
        "ART coverage 2024": kenya and kenya["art"],
    }

    for what, (expected, tolerance) in KNOWN_KENYA.items():
        if not close(found[what], expected, tolerance):
            problems.append(f"Kenya {what}: expected about {expected:,}, found {found[what]}")

    allocated = sum(values[-1] for values in data["allocated"].values())
    unallocated = sum(values[-1] for values in data["unallocated"].values())
    money = {
        "allocated aid 2024": allocated,
        "unallocated aid 2024": unallocated,
        "US unallocated aid 2023": data["unallocated"]["us"][-2],
        "US unallocated aid 2024": data["unallocated"]["us"][-1],
    }

    for what, (expected, tolerance) in KNOWN_MONEY.items():
        if not close(money[what], expected, tolerance):
            problems.append(
                f"{what}: expected about ${expected / 1e9:.2f}bn, found ${money[what] / 1e9:.2f}bn"
            )

    if data["recipients"] != KNOWN_RECIPIENTS:
        problems.append(f"recipients: expected {KNOWN_RECIPIENTS}, found {data['recipients']}")

    if sum(data["allocated"]["globalFund"]) <= 0:
        problems.append("the Global Fund is not present as a provider")

    for country in data["countries"]:
        lengths = {len(values) for values in country["aid"].values()}

        if lengths != {len(YEARS)} or len(country["deaths"]) != len(YEARS):
            problems.append(f"{country['iso3']}: series do not cover {len(YEARS)} years")

    if problems:
        raise SystemExit("Checks failed:\n  " + "\n  ".join(problems))

    last = [
        {key: values[-1] for key, values in country["aid"].items()} for country in data["countries"]
    ]
    big = [aid for aid in last if sum(aid.values()) > MIN_AID]
    majority = [aid for aid in big if max(aid["us"], aid["globalFund"]) > 0.5 * sum(aid.values())]
    log.info(
        "Checks passed: %d countries kept of %d recipients; allocated $%.2fbn and "
        "unallocated $%.2fbn in %d.",
        len(data["countries"]),
        data["recipients"],
        allocated / 1e9,
        unallocated / 1e9,
        LAST_YEAR,
    )
    log.info(
        "%d countries have aid over $1m in %d; in %d of them the United States or the "
        "Global Fund gives more than half; %d kept countries have no aid in %d.",
        len(big),
        LAST_YEAR,
        len(majority),
        sum(1 for aid in last if sum(aid.values()) == 0),
        LAST_YEAR,
    )


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    aid = read_aid()
    plhiv = read_unaids("plhiv", PLHIV_QUESTION)
    art = read_unaids("art", ART_QUESTION)
    places = sorted(plhiv["observationAbout"].unique())
    deaths = read_deaths(places)
    data = build(aid, plhiv, art, deaths)
    check(data)

    retrieved = datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    envelope = {
        "provenance": {
            "sdk": f"development-finance=={dfo.__version__}",
            "query": (
                f"{AID_QUESTION} (OECD CRS, purpose code 13040, gross disbursements, current "
                "US dollars); UNAIDS people living with HIV, antiretroviral therapy coverage "
                "and AIDS-related deaths for each country, 2015 to 2024"
            ),
            "retrieved": retrieved,
            "citation": "; ".join(sorted({read["citation"] for read in READS})),
            "dfo": READS,
        },
        "data": data,
    }
    TARGET.write_text(json.dumps(envelope, indent=1, ensure_ascii=False) + "\n")
    log.info("Wrote %s.", TARGET)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
