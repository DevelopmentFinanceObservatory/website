# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["development-finance[pandas]==0.3.0"]
# ///
"""The hiv-financing data step, run by hand with `pnpm data hiv-financing`.

Fetches, for 2015 to 2024:

- gross ODA disbursements from the OECD CRS under purpose code 13040 (HIV/AIDS), by
  provider and recipient, in constant US dollars at donor prices, with the last year as the
  base. The same read in current dollars gives the Global Fund's deflator for each year.
  Each provider counts as the United States, the Global Fund or other. Money to a recipient
  country is allocated; money to a region or to no country is unallocated;
- the Global Fund's gross ODA disbursements under purpose codes 12250 (infectious disease
  control) and 12110 (health policy and administrative management), both codes in every
  year. It recorded combined HIV and TB grants under 12250 to 2019 and multi-disease grants
  under 12110 from 2020. Only part of that money is for HIV, so the page shows it as its own
  layer beside the 13040 figures. The DFO serves these codes in current dollars only, so
  the step deflates them with the Global Fund's 13040 deflator;
- UNAIDS estimates of people living with HIV and antiretroviral therapy coverage, for
  every country;
- UNAIDS estimates of AIDS-related deaths, fetched for every UNAIDS country and every CRS
  recipient in groups, because a search for the phrase without a place matches OECD regional data.

Checks that the data are what the page assumes (the right datasets and units, every
provider present, countries summing to the totals, and the claims fixed in the page's
prose), failing loudly when one is not. It logs each headline figure against the last
`hiv.json`, flagging moves over 10%, then writes `hiv.json` beside this file. The page
covers aid recipients, so a country is kept when it received HIV aid in the last year,
which leaves out donors such as Germany that have UNAIDS estimates and receive no HIV aid.
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

AID_QUESTION = "HIV/AIDS aid by donor and recipient, 2015 to 2024, in constant prices"
# The same read in current dollars, for the Global Fund's deflator.
AID_CURRENT_QUESTION = "HIV/AIDS aid by donor and recipient, 2015 to 2024"
# The unit the constant read must carry; its year is the base the page prints.
CONSTANT_UNIT = re.compile(r"^Constant (\d{4}) US dollars, donor prices$")
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
    "CHN": "China",
    "CIV": "Côte d'Ivoire",
    "COD": "DR Congo",
    "MMR": "Myanmar",
    "SWZ": "Eswatini",
    "TUR": "Türkiye",
}

# Countries in the UNAIDS reads that DFO's UN source refused to answer for, as the
# un_system_unavailable warning names them. Greece and Slovenia are donors and Western Sahara
# has no HIV aid, so the page leaves out all three; the source refuses Western Sahara on some
# runs only. A refusal for any other place would blank a country the page keeps, so it fails
# the step.
KNOWN_UN_GAPS = {"GRC", "SVN", "ESH"}
# Plausible ranges for Kenya's UNAIDS figures. They are wide enough to pass any UNAIDS
# revision and narrow enough to fail when a search reads another dataset or unit.
KENYA_RANGES = {
    "AIDS deaths 2015": (5_000, 100_000),
    "AIDS deaths 2024": (5_000, 100_000),
    # A percentage, so a fraction such as 0.87 fails.
    "ART coverage 2024": (10, 100),
}
# The lede says the United States and the Global Fund disbursed almost all HIV aid recorded
# for countries in the last year.
ALMOST_ALL = 0.95
# The refresh report flags a headline figure that moves more than this against the last run.
FLAG_MOVE = 0.10

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


def read_aid() -> tuple[pd.DataFrame, int]:
    """The 13040 money in constant dollars, and the base year of its prices."""
    frame = fetch("aid", dfo.search(AID_QUESTION))
    units = set(frame["unit_label"])
    match = CONSTANT_UNIT.match(next(iter(units))) if len(units) == 1 else None

    if match is None:
        raise SystemExit(f"aid: expected constant US dollars at donor prices, read {sorted(units)}")

    frame["provider"] = frame["financingProvider_label"].map(provider_key)
    return frame, int(match.group(1))


def gf_deflators(constant: pd.DataFrame) -> dict[int, float]:
    """The Global Fund's current-to-constant ratio for each year, from its 13040 money."""
    current = fetch("aid-current", dfo.search(AID_CURRENT_QUESTION))

    if set(current["unit_label"]) != {"Current US dollars"}:
        raise SystemExit(
            f"aid-current: expected current US dollars, read {set(current['unit_label'])}"
        )

    def by_year(frame: pd.DataFrame) -> pd.Series:
        rows = frame[frame["financingProvider_label"] == "Global Fund"]
        return rows.groupby(rows["time_period"].astype(int))["value"].sum()

    ratios = (by_year(current) / by_year(constant)).to_dict()

    if sorted(ratios) != YEARS or not all(0.5 < ratio < 1.5 for ratio in ratios.values()):
        raise SystemExit(f"Global Fund deflators missing or implausible: {ratios}")

    return {int(year): float(ratio) for year, ratio in ratios.items()}


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

    if set(frame["unit_label"]) != {"Current US dollars"}:
        raise SystemExit(
            f"Global Fund codes: expected current US dollars, read {set(frame['unit_label'])}"
        )

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
    price_base: int,
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

        # The same rounding as `recipients`, so the two counts agree.
        if round(last) <= 0:
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
        "priceBase": price_base,
        "allocated": provider_series(allocated),
        "unallocated": provider_series(unallocated),
        "globalFundMulti": multi_series(multi),
        "otherProviders": other_providers(allocated),
        "loans": loans(allocated),
        "recipients": int((last_year_aid.round() > 0).sum()),
        "countries": countries,
    }


def figures(data: dict) -> dict[str, float]:
    """The headline figures the page prints from the data, for the refresh report."""
    allocated = data["allocated"]
    us_all = [
        us + other for us, other in zip(allocated["us"], data["unallocated"]["us"], strict=True)
    ]
    last = [{key: values[-1] for key, values in c["aid"].items()} for c in data["countries"]]
    big = [aid for aid in last if sum(aid.values()) > MIN_AID]
    total = sum(values[-1] for values in allocated.values())

    def at(series: list, year: int) -> float:
        return series[YEARS.index(year)]

    return {
        f"aid to countries {LAST_YEAR}": total,
        f"aid for regions or no country {LAST_YEAR}": sum(
            v[-1] for v in data["unallocated"].values()
        ),
        f"other providers' aid to countries {YEARS[0]}": allocated["other"][0],
        f"other providers' aid to countries {LAST_YEAR}": allocated["other"][-1],
        "US 13040 to all recipients 2023": at(us_all, 2023),
        f"US 13040 to all recipients {LAST_YEAR}": at(us_all, LAST_YEAR),
        "US aid to countries 2018": at(allocated["us"], 2018),
        "US aid to countries 2019": at(allocated["us"], 2019),
        "US aid to countries 2020": at(allocated["us"], 2020),
        "Global Fund aid to countries 2019": at(allocated["globalFund"], 2019),
        "Global Fund aid to countries 2020": at(allocated["globalFund"], 2020),
        "Global Fund multi-disease grants to countries 2019": at(data["globalFundMulti"], 2019),
        "Global Fund multi-disease grants to countries 2020": at(data["globalFundMulti"], 2020),
        "ODA loans to countries": data["loans"]["total"],
        "recipient countries": data["recipients"],
        "US and Global Fund share, %": 100
        * (allocated["us"][-1] + allocated["globalFund"][-1])
        / total,
        "countries over $1m": len(big),
        "countries over $1m, Global Fund over half": sum(
            1 for aid in big if aid["globalFund"] > 0.5 * sum(aid.values())
        ),
        "countries over $1m, United States over half": sum(
            1 for aid in big if aid["us"] > 0.5 * sum(aid.values())
        ),
        "countries without a people-living-with-HIV estimate": sum(
            1 for c in data["countries"] if c["plhiv"] is None
        ),
    }


def report(old: dict | None, new: dict) -> None:
    """Log each headline figure against the last run, flagging moves over `FLAG_MOVE`."""
    if old is None:
        log.info("Refresh report: no earlier hiv.json to compare with.")
        return

    before, after = figures(old), figures(new)
    lines = []

    for what, value in after.items():
        was = before.get(what)
        moved = was is not None and was != 0 and abs(value - was) / abs(was) > FLAG_MOVE
        lines.append(
            f"{'FLAG ' if moved else '     '}{what}: {was:,.0f} -> {value:,.0f}"
            if was is not None
            else f"     {what}: new, {value:,.0f}"
        )

    if old.get("priceBase") != new["priceBase"]:
        lines.insert(
            0, f"FLAG price base: {old.get('priceBase', 'current dollars')} -> {new['priceBase']}"
        )

    log.info("Refresh report, last hiv.json -> this run:\n%s", "\n".join(lines))


def check(data: dict, multi: pd.DataFrame) -> None:
    """Fail when the data are not what the page assumes. The printed values may move freely."""
    problems = []
    kenya = next((country for country in data["countries"] if country["iso3"] == "KEN"), None)
    found = {
        "AIDS deaths 2015": kenya and kenya["deaths"][0],
        "AIDS deaths 2024": kenya and kenya["deaths"][-1],
        "ART coverage 2024": kenya and kenya["art"],
    }

    for what, (low, high) in KENYA_RANGES.items():
        if found[what] is None or not low <= found[what] <= high:
            problems.append(f"Kenya {what}: expected {low:,} to {high:,}, found {found[what]}")

    allocated = data["allocated"]

    # Every last-year recipient is in the table, so in the last year the countries sum to the
    # allocated totals, to within a dollar of rounding per country. Earlier years also hold
    # countries that received nothing in the last year.
    for key in PROVIDERS:
        summed = sum(country["aid"][key][-1] for country in data["countries"])

        if abs(summed - allocated[key][-1]) > len(data["countries"]):
            problems.append(
                f"{key} {LAST_YEAR}: countries sum to {summed:,}, "
                f"allocated is {allocated[key][-1]:,}"
            )

    for key in PROVIDERS:
        if any(value <= 0 for value in allocated[key]):
            problems.append(f"{key}: no money to countries in some year, {allocated[key]}")

    total = sum(values[-1] for values in allocated.values())
    share = (allocated["us"][-1] + allocated["globalFund"][-1]) / total

    if share < ALMOST_ALL:
        problems.append(
            f"the lede says almost all HIV aid went through the United States and the Global "
            f"Fund, but their share is {share:.1%}"
        )

    # How to interpret says the Global Fund recorded these grants mostly under 12250 to 2019
    # and mostly under 12110 from 2020.
    by_code = (
        multi[multi["financingRecipient"].str.startswith(COUNTRY, na=False)]
        .groupby(["crsPurpose", "year"])["value"]
        .sum()
    )

    for year in YEARS:
        early = float(by_code.get(("CRSPurposeCode12250", year), 0.0))
        late = float(by_code.get(("CRSPurposeCode12110", year), 0.0))

        if (year < 2020 and early < late) or (year >= 2020 and late < early):
            problems.append(
                f"How to interpret says 12250 leads to 2019 and 12110 from 2020, but {year} "
                f"has 12250 ${early / 1e6:,.0f}m and 12110 ${late / 1e6:,.0f}m"
            )

    if not data["otherProviders"]:
        problems.append("otherProviders is empty")

    if len(data["countries"]) != data["recipients"]:
        problems.append(
            f"countries: expected one per recipient, {data['recipients']}, "
            f"found {len(data['countries'])}"
        )

    for country in data["countries"]:
        lengths = {len(values) for values in country["aid"].values()}

        if (
            lengths != {len(YEARS)}
            or len(country["deaths"]) != len(YEARS)
            or len(country["globalFundMulti"]) != len(YEARS)
        ):
            problems.append(f"{country['iso3']}: series do not cover {len(YEARS)} years")

    if problems:
        raise SystemExit("Checks failed:\n  " + "\n  ".join(problems))

    gaps = sorted(country["name"] for country in data["countries"] if country["plhiv"] is None)
    log.info(
        "Checks passed: %d countries; $%.2fbn to countries in %d, in constant %d dollars. "
        "No UNAIDS people-living-with-HIV estimate: %s.",
        len(data["countries"]),
        total / 1e9,
        LAST_YEAR,
        data["priceBase"],
        ", ".join(gaps) or "none",
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
    aid, price_base = read_aid()
    deflators = gf_deflators(aid)
    plhiv = read_unaids("plhiv", PLHIV_QUESTION)
    art = read_unaids("art", ART_QUESTION)
    multi = read_gf_multi()
    # To constant prices with the Global Fund's own deflator for each year.
    multi["value"] = multi["value"] / multi["year"].map(deflators)
    recipients = aid["financingRecipient"].dropna()
    places = sorted(
        set(plhiv["observationAbout"]) | set(recipients[recipients.str.startswith(COUNTRY)])
    )
    deaths = read_deaths(places)
    data = build(aid, price_base, plhiv, art, deaths, multi)
    check_unaids_gaps(data)
    check(data, multi)
    old = json.loads(TARGET.read_text())["data"] if TARGET.exists() else None
    report(old, data)

    retrieved = datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    envelope = {
        "provenance": {
            "sdk": f"development-finance=={dfo.__version__}",
            "query": (
                f"{AID_QUESTION} (OECD CRS, purpose code 13040, gross disbursements, constant "
                f"{price_base} US dollars at donor prices); UNAIDS people living with HIV, "
                "antiretroviral therapy coverage "
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
