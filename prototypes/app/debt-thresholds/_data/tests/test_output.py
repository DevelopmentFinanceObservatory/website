import json
import os
from pathlib import Path

from pipeline.output import write_envelope, write_text

DATA = Path(__file__).resolve().parent.parent
# The committed output by default; set BASELINE_THRESHOLDS to compare another copy.
BASELINE = Path(os.environ.get("BASELINE_THRESHOLDS", DATA / "thresholds-2024.json"))


def test_write_envelope_reproduces_baseline_bytes(tmp_path):
    original = BASELINE.read_bytes()
    envelope = json.loads(original)
    target = tmp_path / BASELINE.name
    write_envelope(target, envelope["provenance"], envelope["data"])
    assert target.read_bytes() == original


def test_write_envelope_keeps_unicode_and_key_order(tmp_path):
    target = tmp_path / "e.json"
    write_envelope(target, {"b": 1, "a": 2}, {"name": "Côte d'Ivoire", "x": [1.0, None]})
    assert target.read_text() == (
        '{\n  "provenance": {\n    "b": 1,\n    "a": 2\n  },\n  "data": {\n'
        '    "name": "Côte d\'Ivoire",\n    "x": [\n      1.0,\n      null\n    ]\n  }\n}\n'
    )


def test_write_text_writes_verbatim(tmp_path):
    target = tmp_path / "c.md"
    write_text(target, "a\nb")
    assert target.read_bytes() == b"a\nb"
