// Validates the search test fixtures against the dfo-apis wire models: every
// resolve fixture (src/lib/search/test/fixtures) with RESOLVE_RESPONSE_ADAPTER,
// and every catalogue body with CatalogueResponse. Run it after editing a
// fixture or when the API's models change. It needs a dfo-apis checkout with
// its environment synced (`uv sync`).
//
//   node scripts/check-search-fixtures.mts <path to dfo-apis>
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { catalogueBodies } from '../src/lib/search/test/fixtures/catalogue-bodies.ts';
import { fixtures } from '../src/lib/search/test/fixtures/index.ts';

const VALIDATE = `
import json, sys
from pydantic import ValidationError
from search.catalogue.response import CatalogueResponse
from search.models.response import RESOLVE_RESPONSE_ADAPTER

bodies = json.load(sys.stdin)
checks = [(name, body, RESOLVE_RESPONSE_ADAPTER.validate_python) for name, body in bodies["resolve"].items()]
checks += [(name, body, CatalogueResponse.model_validate) for name, body in bodies["catalogue"].items()]
failed = 0
for name, body, validate in checks:
    try:
        validate(body)
        print(f"ok    {name}")
    except ValidationError as error:
        failed += 1
        print(f"FAIL  {name}\\n{error}")
print(f"{len(checks) - failed} of {len(checks)} fixtures match the API models")
sys.exit(1 if failed or not checks else 0)
`;

const apis = process.argv[2];

if (!apis) {
    console.error('usage: node scripts/check-search-fixtures.mts <path to dfo-apis>');
    process.exit(2);
}

try {
    execFileSync('uv', ['run', '--directory', path.resolve(apis), 'python', '-c', VALIDATE], {
        input: JSON.stringify({ resolve: fixtures, catalogue: catalogueBodies }),
        stdio: ['pipe', 'inherit', 'inherit'],
    });
} catch {
    process.exit(1);
}
