# /// script
# requires-python = ">=3.12"
# dependencies = ["development-finance==0.2.0"]
# ///
"""The data step in Python: run by hand with `pnpm data <slug>`, never by the build.

uv reads the block above, installs the pinned SDK in a cached environment and
runs the script. It writes _data/series.json in the same envelope as the
TypeScript step. Pass another path as the first argument to write elsewhere.
"""

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import dfo

QUERY = "ODA from Germany to Nigeria"

# Without a key the client calls the API anonymously, under a per-IP quota.
answer = dfo.search(QUERY)
print(answer)
dataset = answer.fetch()

data = [
    {"year": int(row["time_period"]), "value": float(row["value"])}
    for row in dataset.to_arrow().to_pylist()
]

# ISO 8601 in UTC with a Z, as the TypeScript step writes it.
retrieved = datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")

envelope = {
    "provenance": {
        "sdk": f"development-finance=={dfo.__version__}",
        "query": QUERY,
        "retrieved": retrieved,
        "sentence": dataset.sentence,
        "citation": dataset.citation.text,
    },
    "data": data,
}

default = Path(__file__).with_name("series.json")
target = Path(sys.argv[1]) if len(sys.argv) > 1 else default
target.write_text(json.dumps(envelope, indent=2, ensure_ascii=False) + "\n")
print(f"Wrote {target}.")
