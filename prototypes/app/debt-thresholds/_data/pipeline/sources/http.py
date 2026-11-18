"""Downloads of the World Bank bulk files."""

import logging
from pathlib import Path

import httpx

from pipeline.errors import DataError

log = logging.getLogger("pipeline")


def download(url: str, path: Path, *, client: httpx.Client) -> Path:
    """Fetch `url` to `path` once and return `path`; later runs reuse the file."""
    if path.exists() and is_xlsx(path):
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    log.info("downloading %s", url)
    partial = path.with_suffix(".part")
    with client.stream("GET", url, follow_redirects=True, timeout=900.0) as response:
        response.raise_for_status()
        with partial.open("wb") as out:
            for chunk in response.iter_bytes():
                out.write(chunk)
    if not is_xlsx(partial):
        partial.unlink()
        raise DataError(f"{url} did not return an XLSX file.")
    partial.rename(path)
    return path


def is_xlsx(path: Path) -> bool:
    """Return whether the file starts with the ZIP signature that XLSX files carry."""
    with path.open("rb") as handle:
        return handle.read(2) == b"PK"
