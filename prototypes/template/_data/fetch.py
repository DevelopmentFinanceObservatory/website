# /// script
# requires-python = ">=3.12"
# dependencies = ["development-finance==0.6.0"]
# ///
"""The refs step in Python, run by hand with `pnpm data <slug>`.

It rewrites refs.json, the reads the page's build makes (../_lib/build.ts), which git keeps as
the page's query config. The figures come from the build, which reads each ref at DFO's newest
stored version.

    pnpm data <slug>             fetch each committed ref's newest version, pin it, rewrite
    pnpm data <slug> --search    ask QUERY, pin the answer and write it as the `series` read

`pnpm check:data` requires every ref's versions to be pinned, so the step pins what it writes.
Each new pin counts against a daily allowance.
"""

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

import dfo

# `deriveSeries` (../_lib/build.ts) takes rows by `financingProvider`, which this answer has.
QUERY = "OECD headline ODA by provider"
REFS = Path(__file__).with_name("refs.json")

# Without a key the client calls the API anonymously, under a per-IP quota.
if "--search" in sys.argv[1:]:
    answer = dfo.search(QUERY)
    print(answer)
    fetched = {"series": answer.fetch()}
else:
    committed = json.loads(REFS.read_text())["data"]
    fetched = {
        key: dfo.fetch(dfo.DatasetRef.from_json(json.dumps(entry["ref"])), latest=True)
        for key, entry in committed.items()
    }

data = {}
for key, dataset in fetched.items():
    pinned = dfo.pin(dataset)
    data[key] = {
        "ref": json.loads(pinned.ref.to_json()),
        "provenance": json.loads(pinned.provenance.to_json()),
    }

# ISO 8601 in UTC with a Z, as the TypeScript step writes it.
retrieved = datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")
envelope = {
    "provenance": {
        "sdk": f"development-finance=={dfo.__version__}",
        "query": "__SLUG__ reads",
        "retrieved": retrieved,
    },
    "data": data,
}
REFS.write_text(json.dumps(envelope, indent=2, ensure_ascii=False) + "\n")
print(f"Wrote {REFS}.")
