# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["development-finance[pandas]==0.4.1"]
# ///
"""The hiv-financing data step, run by hand with `pnpm data hiv-financing`.

Reads, for 2015 to 2024:

- gross ODA disbursements from the OECD CRS under purpose code 13040 (HIV/AIDS), by
  provider and recipient, in constant 2024 US dollars at donor prices. Each provider counts
  as the United States, the Global Fund or other. Money to a recipient country is
  allocated; money to a region or to no country is unallocated;
- the Global Fund's gross ODA disbursements under purpose codes 12250 (infectious disease
  control) and 12110 (health policy and administrative management), both codes in every
  year, in the same constant dollars. It recorded combined HIV and TB grants under 12250 to
  2019 and multi-disease grants under 12110 from 2020. Only part of that money is for HIV,
  so the page shows it as its own layer beside the 13040 figures;
- UNAIDS estimates of people living with HIV, antiretroviral therapy coverage and
  AIDS-related deaths, for every country. Deaths are read in one read naming every UNAIDS
  country and every CRS recipient, because a search for the phrase without a place matches
  OECD regional data.

The page reads the UNAIDS data in the browser from the pinned refs in `live-refs.json`, so
`hiv.json` holds the aid figures only. The step checks the UNAIDS reads and writes
`unaids-fixture.json`: real rows for a few countries with the values `unaids_by_country`
gives for them, for the page's parity test.

Three modes:

- plain (no flag): fetch each pinned ref in `refs.json` and rewrite every output, copying
  provenance and the retrieval time from `refs.json`, so the outputs reproduce byte for byte;
- `--refresh`: fetch the newest versions of each committed ref, pin them, rewrite
  `refs.json`. A ref keeps its places, so the run fails when a kept country lies outside
  the deaths read's places, or when the newest versions lose a UNAIDS figure the committed
  versions gave a kept country. `--search` reads the places afresh;
- `--search`: search for each read afresh, pin, rewrite `refs.json`. A ref keeps its
  window and reading, so a change to either takes this mode.

The last two modes pin once every check passes, since each pin counts against a daily
allowance. `--no-pin` skips the pins, for trial runs: it writes `hiv.json` and the fixture
and leaves `refs.json` and `live-refs.json` as they are.

The step checks that the data are what the page assumes (the right datasets and units,
every provider present, countries summing to the totals, and the claims fixed in the
page's prose) and fails loudly when one is not. It logs each headline figure against the
last `hiv.json`, flagging moves over 10%. The page covers aid recipients, so a country is kept
when it received HIV aid in the last year, which leaves out donors such as Germany that have
UNAIDS estimates and receive no HIV aid.
"""

import argparse
import json
import logging
import re
import warnings
from datetime import UTC, datetime
from pathlib import Path

import dfo
import pandas as pd

log = logging.getLogger("hiv-financing")

HERE = Path(__file__).parent
TARGET = HERE / "hiv.json"
REFS = HERE / "refs.json"
LIVE_REFS = HERE / "live-refs.json"
FIXTURE = HERE / "unaids-fixture.json"
SDK = f"development-finance=={dfo.__version__}"

YEARS = list(range(2015, 2025))
WINDOW = (YEARS[0], YEARS[-1])
LAST_YEAR = YEARS[-1]
PRICE_BASE = LAST_YEAR
CONSTANT = {"currency": "USD", "price_basis": "constant", "base_year": PRICE_BASE}
PROVIDERS = ("us", "globalFund", "other")
MIN_AID = 1_000_000
MIN_PLHIV = 50_000
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
AID_KEYS = ("aid", "gf-12250", "gf-12110")
UNAIDS_KEYS = ("plhiv", "art", "deaths")

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
# has no HIV aid, so the page leaves out all three. The source refuses Western Sahara on some
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
# The countries whose UNAIDS rows go into the parity fixture: Kenya, and the first kept
# country of each case the page handles apart (no estimate at all, no ART coverage, no
# first-year deaths figure), found in the data.
FIXTURE_ALWAYS = ("KEN",)
# The columns of a UNAIDS row that `unaids_by_country` reads.
FIXTURE_COLUMNS = ("observationAbout", "time_period", "value")


def now() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def record(data: dfo.Dataset) -> dict:
    """The refs.json entry for one read: its ref and its provenance, as parsed JSON."""
    return {
        "ref": json.loads(data.ref.to_json()),
        "provenance": json.loads(data.provenance.to_json()),
    }


def searched(key: str, answer: dfo.Answer, refused: dict[str, set[str]], **options) -> dfo.Dataset:
    """Fetch every reading of `answer`, noting the places DFO's UN source refused.

    The un_system_unavailable warning on the data says that a refusal happened; only Search's
    note on the reading names the places, so the step reads them from the message text.
    """
    if not answer.complete:
        raise SystemExit(f"{key}: the search has no single reading.\n{answer}")

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        data = answer.fetch(window=WINDOW, **options)

    if any(notice.code == "un_system_unavailable" for notice in data.warnings):
        refused[key] = {
            code.removeprefix(COUNTRY)
            for warning in caught
            for code in re.findall(rf"{COUNTRY}[A-Z]{{3}}", str(warning.message))
        }

    return data


def search_reads() -> tuple[dict[str, dfo.Dataset], dict[str, set[str]]]:
    """Every read, searched afresh, and the places the UN source refused, by read key.

    The deaths places are every UNAIDS country and every CRS recipient country.
    """
    refused: dict[str, set[str]] = {}
    reads = {"aid": searched("aid", dfo.search(AID_QUESTION), refused, **CONSTANT)}

    for code, question in GF_QUESTIONS.items():
        key = f"gf-{code.removeprefix('CRSPurposeCode')}"
        reads[key] = searched(key, dfo.search(question), refused, **CONSTANT)

    for key, question in (("plhiv", PLHIV_QUESTION), ("art", ART_QUESTION)):
        reads[key] = searched(key, dfo.search(question), refused)

    deaths = dfo.search(DEATHS_QUESTION)

    if "AIDS-related deaths" not in deaths.sentence:
        raise SystemExit(f"deaths: the search read something else.\n{deaths.sentence}")

    places = sorted(
        {
            place
            for frame, column in (
                (reads["plhiv"].to_pandas(), "observationAbout"),
                (reads["aid"].to_pandas(), "financingRecipient"),
            )
            for place in frame[column].dropna()
            if place.startswith(COUNTRY)
        }
    )

    # One read, so the browser fetches one member.
    reads["deaths"] = searched("deaths", deaths, refused, entities={"place": places})

    return reads, refused


def committed_records() -> tuple[dict[str, dict], str]:
    if not REFS.exists():
        raise SystemExit(f"{REFS.name} is missing. Run with --search to write it.")

    envelope = json.loads(REFS.read_text())
    return envelope["data"], envelope["provenance"]["retrieved"]


def ref_of(entry: dict) -> dfo.DatasetRef:
    """The ref of a refs.json entry, which holds it as parsed JSON."""
    return dfo.DatasetRef.from_json(json.dumps(entry["ref"]))


def fetch_refs(records: dict[str, dict], *, latest: bool) -> dict[str, dfo.Dataset]:
    return {key: dfo.fetch(ref_of(entry), latest=latest) for key, entry in records.items()}


def read_all(mode: str) -> tuple[dict[str, dfo.Dataset], dict[str, set[str]] | None]:
    """The datasets of every read, unpinned outside plain mode, and the places the UN
    source refused by read key, which only a search reports."""
    if mode == "search":
        return search_reads()

    reads = fetch_refs(committed_records()[0], latest=mode == "refresh")

    if mode == "plain":
        unpinned = sorted(key for key, data in reads.items() if not data.pinned)

        if unpinned:
            raise SystemExit(f"refs.json holds unpinned reads: {', '.join(unpinned)}")

    return reads, None


def keep(reads: dict[str, dfo.Dataset], *, pin: bool) -> dict[str, dfo.Dataset]:
    """The reads, each pinned when `pin`. Run once the checks pass: each new pin counts
    against a daily allowance."""
    if not pin:
        return reads

    reads = {key: dfo.pin(data) for key, data in reads.items()}
    log.info("Pinned %d members.", sum(len(data.members) for data in reads.values()))
    return reads


def notices(records: dict[str, dict]) -> dict[str, list[dfo.types.Notice]]:
    """The warnings of each committed read, as `refs.json` keeps them."""
    return {
        key: list(dfo.Provenance.from_json(entry["provenance"]).warnings)
        for key, entry in records.items()
    }


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


def check_constant(key: str, frame: pd.DataFrame) -> None:
    units = {
        (str(currency), str(basis), int(base))
        for currency, basis, base in frame[["currency", "price_basis", "base_year"]].itertuples(
            index=False
        )
    }

    if units != {("USD", "constant", PRICE_BASE)}:
        raise SystemExit(f"{key}: expected constant {PRICE_BASE} US dollars, read {units}")


def read_aid(frame: pd.DataFrame) -> pd.DataFrame:
    """The 13040 money in constant dollars, with each row's provider key."""
    check_constant("aid", frame)
    frame = frame.copy()
    frame["provider"] = frame["financingProvider_label"].map(provider_key)
    return frame


def read_gf_multi(frames: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """The Global Fund's disbursements under codes 12250 and 12110, by recipient and year."""
    for code in GF_QUESTIONS:
        key = f"gf-{code.removeprefix('CRSPurposeCode')}"
        frame = frames[key]
        found = set(frame["crsPurpose"])

        if found != {code} or set(frame["financingProvider_label"]) != {"Global Fund"}:
            raise SystemExit(
                f"{code}: read {sorted(found)} for {sorted(set(frame['financingProvider_label']))}"
            )

        check_constant(key, frame)

    frame = pd.concat([frames[key] for key in AID_KEYS[1:]], ignore_index=True)
    frame["year"] = frame["time_period"].astype(int)
    return frame


def one_stat_var(key: str, frame: pd.DataFrame) -> pd.DataFrame:
    stat_vars = set(frame["stat_var"])

    if len(stat_vars) != 1:
        raise SystemExit(f"{key}: expected one statistical variable, found {sorted(stat_vars)}")

    return frame


def countries_only(frame: pd.DataFrame) -> pd.DataFrame:
    """The rows for countries; the UNAIDS reads also hold regions and the world."""
    return frame[frame["observationAbout"].str.startswith(COUNTRY, na=False)]


def yearly(frame: pd.DataFrame, place: str) -> dict[int, float]:
    """A read's values by year for `place`. A row with no value counts as no figure, as
    `yearly` in the page's `_lib/unaids.ts` reads it."""
    rows = frame[(frame["observationAbout"] == place) & frame["value"].notna()]
    years = [int(year) for year in rows["time_period"]]

    if len(years) != len(set(years)):
        raise SystemExit(f"{place}: more than one row for a year, {sorted(years)}")

    return dict(zip(years, (float(value) for value in rows["value"]), strict=True))


def unaids_by_country(
    iso3s: list[str], plhiv: pd.DataFrame, art: pd.DataFrame, deaths: pd.DataFrame
) -> dict[str, dict]:
    """The UNAIDS figures the page shows for each country, from the rows of the three reads.

    The page computes the same in the browser from the refs in `live-refs.json`, and its
    parity test checks it against `unaids-fixture.json`, which this function writes.
    """
    found = {}

    for iso3 in iso3s:
        place = COUNTRY + iso3
        people, coverage, died = yearly(plhiv, place), yearly(art, place), yearly(deaths, place)
        found[iso3] = {
            "plhiv": round(people[LAST_YEAR]) if LAST_YEAR in people else None,
            "art": round(coverage[LAST_YEAR], 1) if LAST_YEAR in coverage else None,
            "deaths": [round(died[year]) if year in died else None for year in YEARS],
        }

    return found


def bound_places(data: dfo.Dataset) -> set[str]:
    """The places a read's specs bind."""
    return {place for member in data.members for place in member.spec.roles.get("place") or ()}


def outside_places(iso3s: list[str], places: set[str]) -> list[str]:
    """The kept countries a read with `places` cannot answer for."""
    return [iso3 for iso3 in iso3s if COUNTRY + iso3 not in places]


def lost_figures(before: dict[str, dict], after: dict[str, dict]) -> list[tuple[str, str]]:
    """Each kept country's UNAIDS figure that `before` gives and `after` lacks, as
    (iso3, field), with the year for a deaths figure."""
    lost = []

    for iso3, figures in after.items():
        was = before[iso3]
        lost.extend(
            (iso3, field)
            for field in ("plhiv", "art")
            if was[field] is not None and figures[field] is None
        )
        lost.extend(
            (iso3, f"deaths {year}")
            for year, old, new in zip(YEARS, was["deaths"], figures["deaths"], strict=True)
            if old is not None and new is None
        )

    return lost


def check_places(iso3s: list[str], deaths: dfo.Dataset) -> None:
    """Fail when a kept country lies outside the deaths read's places, which a ref keeps
    from the search that built it."""
    outside = outside_places(iso3s, bound_places(deaths))

    if outside:
        raise SystemExit(
            f"Kept countries outside the deaths read's places: {', '.join(outside)}. "
            "Run with --search to read them."
        )


def check_kept_figures(before: dict[str, dict], after: dict[str, dict]) -> None:
    """Fail when the newest UNAIDS versions lose a figure the committed versions gave a
    kept country, which would blank it on the page."""
    lost = lost_figures(before, after)

    if lost:
        raise SystemExit(
            "The newest UNAIDS versions lose figures the committed refs give: "
            + ", ".join(f"{iso3} {field}" for iso3, field in lost)
            + ". Run with --search to read them afresh."
        )


def unaids_frames(reads: dict[str, dfo.Dataset]) -> dict[str, pd.DataFrame]:
    """The country rows of each UNAIDS read, each read checked for one statistical variable."""
    frames = {key: one_stat_var(key, reads[key].to_pandas()) for key in UNAIDS_KEYS}
    return {
        **frames,
        "plhiv": countries_only(frames["plhiv"]),
        "art": countries_only(frames["art"]),
    }


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


def log_left_out(aid: pd.DataFrame, plhiv: pd.DataFrame) -> None:
    """Log each place with a large epidemic that never received HIV aid in the CRS."""
    recipients = set(aid["financingRecipient"].dropna())

    for place in sorted(set(plhiv["observationAbout"]) - recipients):
        people = yearly(plhiv, str(place)).get(LAST_YEAR) or 0

        if people >= MIN_PLHIV:
            log.info(
                "Left out, never a CRS recipient: %s, %s people living with HIV",
                place,
                f"{people:,.0f}",
            )


def build(aid: pd.DataFrame, multi: pd.DataFrame) -> dict:
    multi = multi[multi["financingRecipient"].str.startswith(COUNTRY, na=False)]
    allocated_mask = aid["financingRecipient"].str.startswith(COUNTRY, na=False)
    allocated, unallocated = aid[allocated_mask], aid[~allocated_mask]
    recipients = {
        str(place): str(label)
        for place, label in allocated.groupby("financingRecipient")["financingRecipient_label"]
        .first()
        .items()
    }
    last_year_aid = (
        allocated[allocated["time_period"].astype(int) == LAST_YEAR]
        .groupby("financingRecipient")["value"]
        .sum()
    )
    countries = []

    for place, label in recipients.items():
        iso3 = place.removeprefix(COUNTRY)
        rows = allocated[allocated["financingRecipient"] == place]
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
                "globalFundMulti": multi_series(multi[multi["financingRecipient"] == place]),
            }
        )

    countries.sort(key=lambda country: -sum(values[-1] for values in country["aid"].values()))
    return {
        "years": YEARS,
        "priceBase": PRICE_BASE,
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


def check(data: dict, multi: pd.DataFrame, unaids: dict[str, dict]) -> None:
    """Fail when the data are not what the page assumes. The printed values may move freely."""
    problems = []
    kenya = unaids.get("KEN")
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

        if lengths != {len(YEARS)} or len(country["globalFundMulti"]) != len(YEARS):
            problems.append(f"{country['iso3']}: series do not cover {len(YEARS)} years")

    if problems:
        raise SystemExit("Checks failed:\n  " + "\n  ".join(problems))

    gaps = sorted(iso3 for iso3, figures in unaids.items() if figures["plhiv"] is None)
    log.info(
        "Checks passed: %d countries; $%.2fbn to countries in %d, in constant %d dollars. "
        "No UNAIDS people-living-with-HIV estimate: %s.",
        len(data["countries"]),
        total / 1e9,
        LAST_YEAR,
        data["priceBase"],
        ", ".join(gaps) or "none",
    )


def check_warnings(
    notices: dict[str, list[dfo.types.Notice]],
    refused: dict[str, set[str]] | None,
    unaids: dict[str, dict],
) -> None:
    """Fail on aid rows a conversion left out, and on an unexpected UN refusal.

    The notices are those kept in refs.json. Only a search names the refused places, so the
    refusal check runs in `--search` mode alone.
    """
    for key, found in notices.items():
        log.info("%s warnings: %s", key, ", ".join(n.code for n in found) or "none")

    omitted = [
        key for key in AID_KEYS if any(n.code == "deflator_missing_omitted" for n in notices[key])
    ]

    if omitted:
        raise SystemExit(f"Constant prices left out rows of {', '.join(omitted)}")

    for field in UNAIDS_KEYS:
        missing = [
            iso3
            for iso3, figures in unaids.items()
            if figures[field] is None or (field == "deaths" and None in figures[field])
        ]
        log.info("Kept countries with missing UNAIDS %s: %s", field, ", ".join(missing) or "none")

    if refused is None:
        log.info("UN refusals: checked only when the reads are searched (--search).")
        return

    for key, codes in refused.items():
        log.info("un_system_unavailable in %s names: %s", key, ", ".join(sorted(codes)) or "none")

    unexpected = {
        key: sorted(codes - KNOWN_UN_GAPS)
        for key, codes in refused.items()
        if not codes or codes - KNOWN_UN_GAPS
    }

    if unexpected or any(codes & set(unaids) for codes in refused.values()):
        raise SystemExit(
            f"UN System Data Commons refused reads for unexpected places: {unexpected}"
        )


def fixture_countries(unaids: dict[str, dict]) -> list[str]:
    cases = [
        lambda f: f["plhiv"] is None and f["art"] is None,
        lambda f: f["plhiv"] is not None and f["art"] is None,
        lambda f: f["plhiv"] is not None and f["deaths"][0] is None,
        lambda f: f["plhiv"] is not None and f["deaths"][-1] is None,
    ]
    chosen = list(FIXTURE_ALWAYS)

    for case in cases:
        match = next((iso3 for iso3, f in unaids.items() if case(f)), None)

        if match is not None and match not in chosen:
            chosen.append(match)

    return chosen


def fixture(frames: dict[str, pd.DataFrame], unaids: dict[str, dict]) -> dict:
    """Real UNAIDS rows for a few countries, and what `unaids_by_country` gives for them.

    The rows also hold one UNAIDS place the page leaves out, which the port must skip.
    """
    iso3s = fixture_countries(unaids)
    left_out = sorted(
        set(frames["plhiv"]["observationAbout"]) - {COUNTRY + iso3 for iso3 in unaids}
    )[:1]
    places = {COUNTRY + iso3 for iso3 in iso3s} | set(left_out)

    def rows(frame: pd.DataFrame) -> list[dict]:
        picked = frame[frame["observationAbout"].isin(places)]
        picked = picked.sort_values(["observationAbout", "time_period"])
        return [
            {
                "observationAbout": str(place),
                "time_period": int(period),
                "value": None if pd.isna(value) else float(value),
            }
            for place, period, value in picked[list(FIXTURE_COLUMNS)].itertuples(index=False)
        ]

    return {
        "years": YEARS,
        "countries": iso3s,
        "rows": {key: rows(frames[key]) for key in UNAIDS_KEYS},
        "expected": {iso3: unaids[iso3] for iso3 in iso3s},
    }


def write(path: Path, query: str, retrieved: str, data: object, **extra: object) -> None:
    envelope = {
        "provenance": {"sdk": SDK, "query": query, "retrieved": retrieved, **extra},
        "data": data,
    }
    path.write_text(json.dumps(envelope, indent=1, ensure_ascii=False) + "\n")
    log.info("Wrote %s.", path.name)


def live_refs(reads: dict[str, dfo.Dataset]) -> dict[str, dict]:
    """The ref of each UNAIDS read, for the browser."""
    return {key: json.loads(reads[key].ref.to_json()) for key in UNAIDS_KEYS}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--refresh", action="store_true", help="read the newest versions")
    modes.add_argument("--search", action="store_true", help="search for every read afresh")
    parser.add_argument(
        "--no-pin",
        action="store_true",
        help="with --refresh or --search, pin nothing and leave refs.json and live-refs.json",
    )
    args = parser.parse_args(argv)
    mode = "refresh" if args.refresh else "search" if args.search else "plain"

    if args.no_pin and mode == "plain":
        parser.error("--no-pin needs --refresh or --search")

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    reads, refused = read_all(mode)

    for key, data in reads.items():
        log.info("%s: %s (%d rows)", key, data.sentence, len(data))

    frames = {key: data.to_pandas() for key, data in reads.items()} | unaids_frames(reads)
    aid = read_aid(frames["aid"])
    multi = read_gf_multi(frames)
    data = build(aid, multi)
    log_left_out(aid, frames["plhiv"])
    kept = [country["iso3"] for country in data["countries"]]
    unaids = unaids_by_country(kept, frames["plhiv"], frames["art"], frames["deaths"])

    if mode == "plain":
        records, retrieved = committed_records()
        warned = notices(records)
    else:
        warned = {key: list(read.provenance.warnings) for key, read in reads.items()}

    check_warnings(warned, refused, unaids)
    check(data, multi, unaids)
    check_places(kept, reads["deaths"])

    if mode == "refresh":
        committed = fetch_refs(
            {key: committed_records()[0][key] for key in UNAIDS_KEYS}, latest=False
        )
        before = unaids_frames(committed)
        check_kept_figures(
            unaids_by_country(kept, before["plhiv"], before["art"], before["deaths"]), unaids
        )

    if mode != "plain":
        reads = keep(reads, pin=not args.no_pin)
        records, retrieved = {key: record(read) for key, read in reads.items()}, now()

    old = json.loads(TARGET.read_text())["data"] if TARGET.exists() else None
    report(old, data)

    citation = "; ".join(
        sorted({records[key]["provenance"]["citation"]["text"] for key in AID_KEYS})
    )
    write(
        TARGET,
        "OECD CRS gross ODA disbursements under purpose code 13040 (HIV/AIDS) by provider and "
        f"recipient, and the Global Fund's under 12250 and 12110 by recipient, 2015 to 2024, "
        f"in constant {PRICE_BASE} US dollars at donor prices",
        retrieved,
        data,
        citation=citation,
        refs=REFS.name,
    )

    if args.no_pin:
        log.info("Trial run (--no-pin): left %s and %s alone.", REFS.name, LIVE_REFS.name)
    else:
        write(REFS, "hiv-financing pinned reads", retrieved, records)
        write(
            LIVE_REFS,
            "hiv-financing pinned UNAIDS reads, read in the browser",
            retrieved,
            live_refs(reads),
        )

    write(
        FIXTURE,
        "UNAIDS rows from the reads in live-refs.json, and the figures the step derives "
        "from them, for the page's parity test",
        retrieved,
        fixture(frames, unaids),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
