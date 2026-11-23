# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["development-finance[pandas]==0.6.0"]
# ///
"""The hiv-financing data step, run by hand with `pnpm data hiv-financing`.

Keeps the reads the page's build starts from, pinned, in `refs.json` (each read's ref and
provenance) and `live-refs.json` (the refs alone), for 2015 to 2024:

- gross ODA disbursements from the OECD CRS under purpose code 13040 (HIV/AIDS), by
  provider and recipient, in constant 2024 US dollars at donor prices;
- the Global Fund's gross ODA disbursements under purpose codes 12250 (infectious disease
  control) and 12110 (health policy and administrative management), in the same dollars;
- UNAIDS estimates of people living with HIV, antiretroviral therapy coverage and
  AIDS-related deaths. Deaths are read in one read naming every UNAIDS country and every CRS
  recipient country, because a search for the phrase without a place matches OECD regional
  data.

The build reads each ref at DFO's newest stored version, runs the aid recipes on it, takes the
names the page prints from the aid read's labels, and derives every figure (`_lib/figures.ts`).
The refs say what the page reads; their pinned versions are the ones this step last checked.

Three modes:

- plain (no flag): fetch each pinned ref in `refs.json` and run the checks, writing nothing;
- `--refresh`: fetch the newest versions of each committed ref, check, pin them, and rewrite
  both files. A ref keeps its places, so the run fails when an aid recipient country lies
  outside the deaths read's places. `--search` reads the places afresh;
- `--search`: search for each read afresh, check, pin, and rewrite both files. A ref keeps
  its window and reading, so a change to either takes this mode.

The last two modes pin once every check passes, since each pin counts against a daily
allowance. `--no-pin` runs them without pinning or writing, for trial runs.

The checks fail loudly when a read is not what the build assumes: each Global Fund read holds
its own purpose code and the Global Fund alone, each UNAIDS read holds one statistical variable,
the deaths read binds every aid recipient country, no aid rows were left out for a missing
deflator, and, in `--search` mode, DFO's UN source refused no place beyond `KNOWN_UN_GAPS`.
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
REFS = HERE / "refs.json"
LIVE_REFS = HERE / "live-refs.json"
SDK = f"development-finance=={dfo.__version__}"

WINDOW = (2015, 2024)
PRICE_BASE = WINDOW[1]
CONSTANT = {"currency": "USD", "price_basis": "constant", "base_year": PRICE_BASE}
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
GLOBAL_FUND = "GlobalFund"
PROVIDER = "financingProvider"
RECIPIENT = "financingRecipient"

# Countries in the UNAIDS reads that DFO's UN source refused to answer for, as the
# un_system_unavailable warning names them. Greece and Slovenia are donors and Western Sahara
# has no HIV aid, so the page leaves out all three. The source refuses Western Sahara on some
# runs only. A refusal for any other place could blank a country the page keeps, so it fails
# the step.
KNOWN_UN_GAPS = {"GRC", "SVN", "ESH"}


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
                (reads["aid"].to_pandas(), RECIPIENT),
            )
            for place in frame[column].dropna()
            if place.startswith(COUNTRY)
        }
    )

    # One read, so the build fetches one member.
    reads["deaths"] = searched("deaths", deaths, refused, entities={"place": places})

    return reads, refused


def committed_records() -> dict[str, dict]:
    if not REFS.exists():
        raise SystemExit(f"{REFS.name} is missing. Run with --search to write it.")

    return json.loads(REFS.read_text())["data"]


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

    reads = fetch_refs(committed_records(), latest=mode == "refresh")

    if mode == "plain":
        unpinned = sorted(key for key, data in reads.items() if not data.pinned)

        if unpinned:
            raise SystemExit(f"refs.json holds unpinned reads: {', '.join(unpinned)}")

    return reads, None


def notices(records: dict[str, dict]) -> dict[str, list[dfo.types.Notice]]:
    """The warnings of each committed read, as `refs.json` keeps them."""
    return {
        key: list(dfo.Provenance.from_json(entry["provenance"]).warnings)
        for key, entry in records.items()
    }


def check_gf_reads(frames: dict[str, pd.DataFrame]) -> None:
    """Fail unless each Global Fund read holds its own purpose code and the Global Fund alone."""
    for code in GF_QUESTIONS:
        key = f"gf-{code.removeprefix('CRSPurposeCode')}"
        frame = frames[key]
        found, providers = set(frame["crsPurpose"]), set(frame[PROVIDER])

        if found != {code} or providers != {GLOBAL_FUND}:
            raise SystemExit(f"{code}: read {sorted(found)} for {sorted(providers)}")


def check_one_stat_var(frames: dict[str, pd.DataFrame]) -> None:
    """Fail unless each UNAIDS read holds one statistical variable."""
    for key in UNAIDS_KEYS:
        stat_vars = set(frames[key]["stat_var"])

        if len(stat_vars) != 1:
            raise SystemExit(f"{key}: expected one statistical variable, found {sorted(stat_vars)}")


def aid_countries(aid: pd.DataFrame) -> list[str]:
    """The ISO codes of the aid read's recipient countries, the countries the page may keep."""
    return sorted(
        {
            str(place).removeprefix(COUNTRY)
            for place in aid[RECIPIENT].dropna()
            if str(place).startswith(COUNTRY)
        }
    )


def bound_places(data: dfo.Dataset) -> set[str]:
    """The places a read's specs bind."""
    return {place for member in data.members for place in member.spec.roles.get("place") or ()}


def outside_places(iso3s: list[str], places: set[str]) -> list[str]:
    """The countries a read with `places` cannot answer for."""
    return [iso3 for iso3 in iso3s if COUNTRY + iso3 not in places]


def check_places(iso3s: list[str], deaths: dfo.Dataset) -> None:
    """Fail when an aid recipient country lies outside the deaths read's places, which a ref
    keeps from the search that built it."""
    outside = outside_places(iso3s, bound_places(deaths))

    if outside:
        raise SystemExit(
            f"Aid recipient countries outside the deaths read's places: {', '.join(outside)}. "
            "Run with --search to read them."
        )


def check_warnings(
    found: dict[str, list[dfo.types.Notice]],
    refused: dict[str, set[str]] | None,
    countries: list[str],
) -> None:
    """Fail on aid rows a conversion left out, and on an unexpected UN refusal.

    Only a search names the refused places, so the refusal check runs in `--search` mode alone.
    """
    for key, warned in found.items():
        log.info("%s warnings: %s", key, ", ".join(n.code for n in warned) or "none")

    omitted = [
        key for key in AID_KEYS if any(n.code == "deflator_missing_omitted" for n in found[key])
    ]

    if omitted:
        raise SystemExit(f"Constant prices left out rows of {', '.join(omitted)}")

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

    if unexpected or any(codes & set(countries) for codes in refused.values()):
        raise SystemExit(
            f"UN System Data Commons refused reads for unexpected places: {unexpected}"
        )


def write(path: Path, query: str, retrieved: str, data: object) -> None:
    """Writes the envelope."""
    envelope = {
        "provenance": {"sdk": SDK, "query": query, "retrieved": retrieved},
        "data": data,
    }
    path.write_text(json.dumps(envelope, indent=1, ensure_ascii=False) + "\n")
    log.info("Wrote %s.", path.name)


def live_refs(reads: dict[str, dfo.Dataset]) -> dict[str, dict]:
    """The ref of each read the build reads: the UNAIDS reads, and the aid reads."""
    return {key: json.loads(reads[key].ref.to_json()) for key in (*UNAIDS_KEYS, *AID_KEYS)}


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

    frames = {key: data.to_pandas() for key, data in reads.items()}
    countries = aid_countries(frames["aid"])
    check_gf_reads(frames)
    check_one_stat_var(frames)
    warned = (
        notices(committed_records())
        if mode == "plain"
        else {key: list(read.provenance.warnings) for key, read in reads.items()}
    )
    check_warnings(warned, refused, countries)
    check_places(countries, reads["deaths"])
    log.info("Checks passed: %d aid recipient countries.", len(countries))

    if mode == "plain":
        return 0

    if args.no_pin:
        log.info("Trial run (--no-pin): left %s and %s alone.", REFS.name, LIVE_REFS.name)
        return 0

    pinned = {key: dfo.pin(read) for key, read in reads.items()}
    log.info("Pinned %d members.", sum(len(read.members) for read in pinned.values()))
    retrieved = now()
    write(
        REFS,
        "hiv-financing pinned reads",
        retrieved,
        {key: record(read) for key, read in pinned.items()},
    )
    write(
        LIVE_REFS,
        "hiv-financing pinned reads the build reads: the UNAIDS reads, and the aid reads its "
        "recipes and names start from",
        retrieved,
        live_refs(pinned),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
