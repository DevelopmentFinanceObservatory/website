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
- the Global Fund's gross ODA disbursements under purpose codes 12250 (infectious disease
  control) and 12110 (health policy and administrative management), both codes in every
  year. It recorded combined HIV and TB grants under 12250 to 2019 and multi-disease grants
  under 12110 from 2020. Only part of that money is for HIV, so the page shows it as its own
  layer beside the 13040 figures;
- UNAIDS estimates of people living with HIV and antiretroviral therapy coverage, for
  every country;
- UNAIDS estimates of AIDS-related deaths, fetched for every UNAIDS country and every CRS
  recipient in groups, because a search for the phrase without a place matches OECD regional data.

Checks known values, failing loudly when one differs, then writes `hiv.json` beside this
file. The page covers aid recipients, so a country is kept only when it appears as a CRS
recipient of HIV aid in some year of the window, which leaves out donors such as Germany
that have UNAIDS estimates and receive no HIV aid. Of those, it is kept when it received
$1m or more in the last year or has 50,000 or more people living with HIV.
"""

import json
import logging
import re
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
# UNAIDS reads cover about 190 countries. The deaths read takes them in groups.
DEATHS_GROUP = 30
COUNTRY = "country/"

AID_QUESTION = "HIV/AIDS aid by donor and recipient, 2015 to 2024"
PLHIV_QUESTION = "people living with HIV, 2015 to 2024"
ART_QUESTION = "coverage of antiretroviral therapy among people living with HIV, 2015 to 2024"
# Any country works as the example. A question naming no place matches OECD regional data.
DEATHS_QUESTION = "AIDS-related deaths in Kenya"
# The Global Fund's multi-disease grants, by CRS purpose code.
GF_QUESTIONS = {
    "CRSPurposeCode12250": "Global Fund infectious disease control aid by recipient",
    "CRSPurposeCode12110": "Global Fund aid for health policy and administrative management",
}

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

# Expected values from the DFO. A refetch that moves one fails here, so a change in the
# source is seen before it reaches the page.
KNOWN_RECIPIENTS = 113
# Countries in the UNAIDS reads that DFO's UN source refused to answer for, as the
# un_system_unavailable warning names them. Greece and Slovenia are donors and Western Sahara
# has no HIV aid, so the page leaves out all three; the source refuses Western Sahara on some
# runs only. A refusal for any other place would blank a country the page keeps, so it fails
# the step.
KNOWN_UN_GAPS = {"GRC", "SVN", "ESH"}
KNOWN_COUNTRIES = 98
# Kept countries with no UNAIDS people-living-with-HIV figure in the DFO's UNAIDS source.
# UNAIDS publishes estimates for some of them, so the page says the figure is missing from
# the DFO's source. The set fails the step when it changes.
KNOWN_UNAIDS_GAPS = {"UKR", "UZB", "NIC", "XKS", "MUS"}
# Printed figures, pinned to within half of the last digit printed: (what, value, unit of
# the last printed digit).
PINNED_MONEY = {
    "allocated aid 2024": (6.38e9, 1e7),
    "unallocated aid 2024": (4.24e9, 1e7),
    "US unallocated aid 2022": (3.72e9, 1e7),
    "US unallocated aid 2023": (626e6, 1e6),
    "US unallocated aid 2024": (4.11e9, 1e7),
    "other providers' aid to countries 2015": (342e6, 1e6),
    "other providers' aid to countries 2024": (46e6, 1e6),
    "five largest falls among other providers, 2015 to 2024": (230e6, 1e6),
    "US 13040 to all recipients 2023": (4.01e9, 1e7),
    "US 13040 to all recipients 2024": (8.01e9, 1e7),
    "US aid to countries 2018": (3.65e9, 1e7),
    "US aid to countries 2019": (2.11e9, 1e7),
    "US aid to countries 2020": (3.72e9, 1e7),
    "lowest US aid to countries 2020 to 2024": (3.20e9, 1e7),
    "highest US aid to countries 2020 to 2024": (3.90e9, 1e7),
    "Global Fund aid to countries 2019": (1.06e9, 1e7),
    "Global Fund aid to countries 2020": (2.10e9, 1e7),
    "Global Fund multi-disease grants to countries 2019": (742e6, 1e6),
    "Global Fund multi-disease grants to countries 2020": (108e6, 1e6),
    "ODA loans under 13040 to countries 2015 to 2024": (467e6, 1e6),
}
# Printed whole numbers.
PINNED_COUNTS = {
    "United States and Global Fund share of allocated aid 2024, %": 99,
    "countries over $1m in 2024": 94,
    "countries over $1m where the Global Fund gives over half": 64,
    "countries over $1m where the United States gives over half": 27,
    "countries over $1m where the United States gives nothing": 31,
    "of the US-majority countries, those with Global Fund multi-disease grants": 10,
}
# (what, value, expected, tolerance as a fraction)
KNOWN_GF_MULTI = {
    # The review's $599m counts every recipient, regions included; $520m goes to countries.
    "Global Fund 12110 to countries 2024": (520e6, 0.005),
    "Namibia 12110 2024": (16e6, 0.05),
}
# The Global Fund's 12250 money to every recipient, each year 2015 to 2019, between these
# bounds ($346m in 2016 to $706m in 2019, to within half a percent), and its 12110 money to
# every recipient in 2020 and 2024.
KNOWN_GF_12250 = (346e6 * 0.995, 706e6 * 1.005)
KNOWN_GF_12110_ALL = {2020: (121e6, 0.01), 2024: (599e6, 0.005)}
# South Africa's 12250 disbursements, 2017 to 2019, between these bounds.
KNOWN_ZAF_12250 = (81e6, 116e6)
KNOWN_KENYA = {
    "AIDS deaths 2015": (36_400, 0.05),
    "AIDS deaths 2024": (20_800, 0.05),
    # A percentage, so a fraction such as 0.87 fails.
    "ART coverage 2024": (87, 0.02),
}

READS: list[dict] = []
# ISO3 codes named by an un_system_unavailable warning, by read key.
UN_GAPS: dict[str, set[str]] = {}


def fetch(key: str, answer: dfo.Answer, **options) -> pd.DataFrame:
    """Fetch every reading of `answer`, recording what was read."""
    if not answer.complete:
        raise SystemExit(f"{key}: the search has no single reading.\n{answer}")

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        data = answer.fetch(window=WINDOW, **options)

    messages = [str(warning.message) for warning in caught]

    if any("[un_system_unavailable]" in message for message in messages):
        UN_GAPS[key] = {
            code.removeprefix(COUNTRY)
            for message in messages
            for code in re.findall(rf"{COUNTRY}[A-Z]{{3}}", message)
        }

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


def read_gf_multi() -> pd.DataFrame:
    """The Global Fund's disbursements under codes 12250 and 12110, by recipient and year."""
    frames = []

    for code, question in GF_QUESTIONS.items():
        frame = fetch(f"gf-{code.removeprefix('CRSPurposeCode')}", dfo.search(question))
        found = set(frame["crsPurpose"])

        if found != {code} or set(frame["financingProvider_label"]) != {"Global Fund"}:
            raise SystemExit(
                f"{code}: read {sorted(found)} for {sorted(set(frame['financingProvider_label']))}"
            )

        frames.append(frame)

    frame = pd.concat(frames, ignore_index=True)
    frame["year"] = frame["time_period"].astype(int)
    return frame


def read_unaids(key: str, question: str, **options) -> pd.DataFrame:
    frame = fetch(key, dfo.search(question), **options)
    stat_vars = set(frame["stat_var"])

    if len(stat_vars) != 1:
        raise SystemExit(f"{key}: expected one statistical variable, found {sorted(stat_vars)}")

    return frame[frame["observationAbout"].str.startswith(COUNTRY)]


def read_deaths(places: list[str]) -> pd.DataFrame:
    answer = dfo.search(DEATHS_QUESTION)

    if "AIDS-related deaths" not in answer.sentence:
        raise SystemExit(f"deaths: the search read something else.\n{answer.sentence}")

    frames = [
        fetch(
            f"deaths-{start // DEATHS_GROUP + 1}",
            answer,
            entities={"place": places[start : start + DEATHS_GROUP]},
        )
        for start in range(0, len(places), DEATHS_GROUP)
    ]
    frame = pd.concat(frames, ignore_index=True)
    stat_vars = set(frame["stat_var"])

    if len(stat_vars) != 1:
        raise SystemExit(f"deaths: expected one statistical variable, found {sorted(stat_vars)}")

    return frame


def yearly(frame: pd.DataFrame, place: str) -> dict[int, float]:
    rows = frame[frame["observationAbout"] == place]
    years = [int(year) for year in rows["time_period"]]

    if len(years) != len(set(years)):
        raise SystemExit(f"{place}: more than one row for a year, {sorted(years)}")

    return dict(zip(years, (float(value) for value in rows["value"]), strict=True))


def multi_series(rows: pd.DataFrame) -> list[int]:
    """The Global Fund's multi-disease money by year, 0 where none is recorded."""
    totals = rows.groupby("year")["value"].sum()
    return [round(float(totals.get(year, 0.0))) for year in YEARS]


def other_providers(allocated: pd.DataFrame) -> list[dict]:
    """Providers in "other" with $1m or more to countries in the first or last year."""
    rows = allocated[allocated["provider"] == "other"]
    totals = rows.groupby(["financingProvider_label", rows["time_period"].astype(int)])[
        "value"
    ].sum()
    found = []

    for name in sorted(set(rows["financingProvider_label"])):
        first, last = (round(float(totals.get((name, year), 0.0))) for year in WINDOW)

        if max(first, last) >= MIN_AID:
            found.append({"name": str(name), "first": first, "last": last})

    return sorted(found, key=lambda provider: -provider["first"])


def loans(allocated: pd.DataFrame) -> dict:
    """The ODA loans inside the 13040 money to countries over the window, by lender."""
    rows = allocated[allocated["crsTypeOfFinance_label"] == "standard loan"]
    by_lender = rows.groupby("financingProvider_label")["value"].sum().sort_values(ascending=False)
    return {
        "total": round(float(rows["value"].sum())),
        "lenders": [
            {"name": str(name), "value": round(float(value))} for name, value in by_lender.items()
        ],
    }


def build(
    aid: pd.DataFrame,
    plhiv: pd.DataFrame,
    art: pd.DataFrame,
    deaths: pd.DataFrame,
    multi: pd.DataFrame,
) -> dict:
    multi = multi[multi["financingRecipient"].str.startswith(COUNTRY, na=False)]
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
        gf_multi = multi_series(multi[multi["financingRecipient"] == place])
        series = (
            provider_series(rows) if len(rows) else {key: [0] * len(YEARS) for key in PROVIDERS}
        )
        last = sum(values[-1] for values in series.values())

        if last <= MIN_AID and (people.get(LAST_YEAR) or 0) < MIN_PLHIV:
            continue

        countries.append(
            {
                "iso3": iso3,
                "name": NAMES.get(iso3, label),
                "aid": series,
                "plhiv": round(people[LAST_YEAR]) if LAST_YEAR in people else None,
                "art": round(coverage[LAST_YEAR], 1) if LAST_YEAR in coverage else None,
                "deaths": [round(died[year]) if year in died else None for year in YEARS],
                "globalFundMulti": gf_multi,
            }
        )

    countries.sort(key=lambda country: -sum(values[-1] for values in country["aid"].values()))
    return {
        "years": YEARS,
        "allocated": provider_series(allocated),
        "unallocated": provider_series(unallocated),
        "globalFundMulti": multi_series(multi),
        "otherProviders": other_providers(allocated),
        "loans": loans(allocated),
        "recipients": int((last_year_aid.round() > 0).sum()),
        "countries": countries,
    }


def close(value: float | None, expected: float, tolerance: float) -> bool:
    return value is not None and abs(value - expected) <= tolerance * expected


def pinned(value: float, printed: float, unit: float) -> bool:
    """Whether `value` prints as `printed`, to the digit worth `unit`."""
    return abs(value - printed) <= unit / 2


def check(data: dict, multi: pd.DataFrame) -> None:
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
    others = {provider["name"]: provider for provider in data["otherProviders"]}
    other_first = data["allocated"]["other"][0]
    other_last = data["allocated"]["other"][-1]
    us_all = [
        us + elsewhere
        for us, elsewhere in zip(data["allocated"]["us"], data["unallocated"]["us"], strict=True)
    ]
    us_steady = data["allocated"]["us"][YEARS.index(2020) :]
    falls = sorted(
        (provider["first"] - provider["last"] for provider in data["otherProviders"]),
        reverse=True,
    )

    def at(series: list, year: int) -> float:
        return series[YEARS.index(year)]

    money = {
        "allocated aid 2024": allocated,
        "unallocated aid 2024": unallocated,
        "US unallocated aid 2022": data["unallocated"]["us"][-3],
        "US unallocated aid 2023": data["unallocated"]["us"][-2],
        "US unallocated aid 2024": data["unallocated"]["us"][-1],
        "other providers' aid to countries 2015": other_first,
        "other providers' aid to countries 2024": other_last,
        "five largest falls among other providers, 2015 to 2024": sum(
            fall for fall in falls[:5] if fall > 0
        ),
        "US 13040 to all recipients 2023": at(us_all, 2023),
        "US 13040 to all recipients 2024": at(us_all, 2024),
        "US aid to countries 2018": at(data["allocated"]["us"], 2018),
        "US aid to countries 2019": at(data["allocated"]["us"], 2019),
        "US aid to countries 2020": at(data["allocated"]["us"], 2020),
        "lowest US aid to countries 2020 to 2024": min(us_steady),
        "highest US aid to countries 2020 to 2024": max(us_steady),
        "Global Fund aid to countries 2019": at(data["allocated"]["globalFund"], 2019),
        "Global Fund aid to countries 2020": at(data["allocated"]["globalFund"], 2020),
        "Global Fund multi-disease grants to countries 2019": at(data["globalFundMulti"], 2019),
        "Global Fund multi-disease grants to countries 2020": at(data["globalFundMulti"], 2020),
        "ODA loans under 13040 to countries 2015 to 2024": data["loans"]["total"],
    }

    for what, (printed, unit) in PINNED_MONEY.items():
        if not pinned(money[what], printed, unit):
            problems.append(
                f"{what}: expected {printed:,.0f} to within {unit / 2:,.0f}, found {money[what]:,}"
            )

    last = [
        {key: values[-1] for key, values in country["aid"].items()} for country in data["countries"]
    ]
    big = [
        (aid, country["globalFundMulti"][-1])
        for aid, country in zip(last, data["countries"], strict=True)
        if sum(aid.values()) > MIN_AID
    ]
    us_majority = [multi for aid, multi in big if aid["us"] > 0.5 * sum(aid.values())]
    share = (data["allocated"]["us"][-1] + data["allocated"]["globalFund"][-1]) / allocated
    counts = {
        "United States and Global Fund share of allocated aid 2024, %": round(100 * share),
        "countries over $1m in 2024": len(big),
        "countries over $1m where the Global Fund gives over half": sum(
            1 for aid, _ in big if aid["globalFund"] > 0.5 * sum(aid.values())
        ),
        "countries over $1m where the United States gives over half": len(us_majority),
        "countries over $1m where the United States gives nothing": sum(
            1 for aid, _ in big if aid["us"] == 0
        ),
        "of the US-majority countries, those with Global Fund multi-disease grants": sum(
            1 for multi in us_majority if multi > 0
        ),
    }

    for what, expected in PINNED_COUNTS.items():
        if counts[what] != expected:
            problems.append(f"{what}: expected {expected}, found {counts[what]}")

    if not others:
        problems.append("otherProviders is empty")

    countries = multi[multi["financingRecipient"].str.startswith(COUNTRY, na=False)]
    gf_12110 = countries[countries["crsPurpose"] == "CRSPurposeCode12110"]
    in_2024 = gf_12110[gf_12110["year"] == LAST_YEAR]
    namibia = in_2024[in_2024["financingRecipient"] == "country/NAM"]["value"].sum()
    zaf = countries[
        (countries["crsPurpose"] == "CRSPurposeCode12250")
        & (countries["financingRecipient"] == "country/ZAF")
        & countries["year"].between(2017, 2019)
    ].sort_values("year")["value"]
    gf_found = {
        "Global Fund 12110 to countries 2024": float(in_2024["value"].sum()),
        "Namibia 12110 2024": float(namibia),
    }

    for what, (expected, tolerance) in KNOWN_GF_MULTI.items():
        if not close(gf_found[what], expected, tolerance):
            problems.append(
                f"{what}: expected about ${expected / 1e6:,.0f}m, found {gf_found[what]:,.0f}"
            )

    by_code = multi.groupby(["crsPurpose", "year"])["value"].sum()
    low12250, high12250 = KNOWN_GF_12250

    for year in range(2015, 2020):
        total = float(by_code.get(("CRSPurposeCode12250", year), 0.0))

        if not low12250 <= total <= high12250:
            problems.append(
                f"Global Fund 12250 to all recipients {year}: expected $346m to $706m, "
                f"found {total:,.0f}"
            )

    for year, (expected, tolerance) in KNOWN_GF_12110_ALL.items():
        total = float(by_code.get(("CRSPurposeCode12110", year), 0.0))
        gf_found[f"Global Fund 12110 to all recipients {year}"] = total

        if not close(total, expected, tolerance):
            problems.append(
                f"Global Fund 12110 to all recipients {year}: expected about "
                f"${expected / 1e6:,.0f}m, found {total:,.0f}"
            )

    gf_found["Global Fund 12250 to all recipients 2015 to 2019"] = [
        round(float(by_code.get(("CRSPurposeCode12250", year), 0.0))) for year in range(2015, 2020)
    ]

    low, high = KNOWN_ZAF_12250
    if len(zaf) != 3 or not all(low <= value <= high for value in zaf):
        problems.append(
            f"South Africa 12250 2017 to 2019: expected ${low / 1e6:.0f}m to "
            f"${high / 1e6:.0f}m a year, found {list(zaf)}"
        )

    if sum(data["globalFundMulti"]) <= 0 or any(
        len(country["globalFundMulti"]) != len(YEARS) for country in data["countries"]
    ):
        problems.append("the Global Fund multi-disease series are missing or of the wrong length")

    if len(data["countries"]) != KNOWN_COUNTRIES:
        problems.append(f"countries: expected {KNOWN_COUNTRIES}, found {len(data['countries'])}")

    if data["recipients"] != KNOWN_RECIPIENTS:
        problems.append(f"recipients: expected {KNOWN_RECIPIENTS}, found {data['recipients']}")

    if sum(data["allocated"]["globalFund"]) <= 0:
        problems.append("the Global Fund is not present as a provider")

    for country in data["countries"]:
        lengths = {len(values) for values in country["aid"].values()}

        if lengths != {len(YEARS)} or len(country["deaths"]) != len(YEARS):
            problems.append(f"{country['iso3']}: series do not cover {len(YEARS)} years")

    gaps = {country["iso3"] for country in data["countries"] if country["plhiv"] is None}

    if gaps != KNOWN_UNAIDS_GAPS:
        problems.append(
            f"kept countries with no UNAIDS people living with HIV: expected "
            f"{sorted(KNOWN_UNAIDS_GAPS)}, found {sorted(gaps)}"
        )

    log.info("Found: %s %s %s %s", money, counts, gf_found, [round(v) for v in zaf])

    if problems:
        raise SystemExit("Checks failed:\n  " + "\n  ".join(problems))

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
        "%d kept countries have no aid in %d. Other providers: %s. Loans: %s.",
        sum(1 for aid in last if sum(aid.values()) == 0),
        LAST_YEAR,
        data["otherProviders"],
        data["loans"],
    )


def check_unaids_gaps(data: dict) -> None:
    """Log each kept country missing a UNAIDS figure, and fail on an unexpected UN refusal."""
    for field in ("plhiv", "art", "deaths"):
        missing = [
            country["iso3"]
            for country in data["countries"]
            if country[field] is None or (field == "deaths" and None in country[field])
        ]
        log.info("Kept countries with missing UNAIDS %s: %s", field, ", ".join(missing) or "none")

    kept = {country["iso3"] for country in data["countries"]}
    unexpected = {
        key: sorted(codes - KNOWN_UN_GAPS)
        for key, codes in UN_GAPS.items()
        if not codes or codes - KNOWN_UN_GAPS
    }

    for key, codes in UN_GAPS.items():
        log.info("un_system_unavailable in %s names: %s", key, ", ".join(sorted(codes)) or "none")

    if unexpected or any(codes & kept for codes in UN_GAPS.values()):
        raise SystemExit(
            f"UN System Data Commons refused reads for unexpected places: {unexpected}"
        )


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    aid = read_aid()
    plhiv = read_unaids("plhiv", PLHIV_QUESTION)
    art = read_unaids("art", ART_QUESTION)
    multi = read_gf_multi()
    recipients = aid["financingRecipient"].dropna()
    places = sorted(
        set(plhiv["observationAbout"]) | set(recipients[recipients.str.startswith(COUNTRY)])
    )
    deaths = read_deaths(places)
    data = build(aid, plhiv, art, deaths, multi)
    check_unaids_gaps(data)
    check(data, multi)

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
