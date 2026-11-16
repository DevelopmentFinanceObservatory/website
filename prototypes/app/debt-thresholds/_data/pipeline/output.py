"""Writers for the step's output files."""

import json
from pathlib import Path


def write_envelope(path: Path, provenance: dict, data: object) -> None:
    """Write `data` with its provenance as the JSON envelope the page loads."""
    envelope = {"provenance": provenance, "data": data}
    path.write_text(json.dumps(envelope, indent=2, ensure_ascii=False) + "\n")


def write_text(path: Path, text: str) -> None:
    """Write a text output such as coverage.md."""
    path.write_text(text)
