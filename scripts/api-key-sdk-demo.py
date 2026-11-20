# /// script
# requires-python = ">=3.12"
# dependencies = ["development-finance"]
# ///
"""Checks API key enforcement end to end through the Python SDK.

Sends seven keyed calls, then one anonymous call, and prints one line each.
With a key whose daily quota is 5 (set it on /admin/api-keys), calls 1 to 5
are answered, calls 6 and 7 raise RateLimitError (429 rate_limited), and the
anonymous call is answered. Retries and the client cache are off so every
call reaches the proxy.

    DFO_BASE_URL=http://localhost:3000/api/v1 DFO_API_KEY=dfo_k_... \
        uv run scripts/api-key-sdk-demo.py

To use a local SDK checkout, add `--with-editable <path to sdk/python>`.
"""

import os

import dfo

# The format check is the SDK's internal helper; the client runs the same check
# when it reads the key.
from dfo._config.keys import check_key_format

key = os.environ["DFO_API_KEY"]
print("key format check:", check_key_format(key) or "ok")

client = dfo.Client(max_retries=0, cache=False)
for i in range(1, 8):
    try:
        matches = client.lookup.resolve("Nigeria")
        print(f"call {i}: ok ({len(matches)} match)")
    except dfo.errors.RateLimitError as error:
        print(
            f"call {i}: RateLimitError {error.status} {error.code}, "
            f"retry_after={error.retry_after:.0f}s"
        )
        if i == 6:
            print(f"        {error.detail}")

anonymous = dfo.Client(api_key=False, max_retries=0, cache=False)
print(f"anonymous: ok ({len(anonymous.lookup.resolve('Nigeria'))} match)")
