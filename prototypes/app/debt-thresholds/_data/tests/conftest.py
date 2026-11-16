"""Puts `_data/` on the import path so tests import `pipeline`."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
