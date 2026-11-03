// Checks that vendor/developmentfinance-client.provenance.json says where the
// vendored @developmentfinance/client tarball came from, and that it agrees
// with the commit that vendored the tarball. The tarball itself records only
// its package version, so the sdk commit and the spec-kit revision it was built
// from live in the provenance file beside it. CI runs this; it needs the full
// git history, because it reads the subject of the last commit that touched the
// tarball, which must name the sdk commit as "sdk <hash>", as the vendoring
// commits do ("chore(deps): vendor the client at sdk 82701c8").
//
//   node scripts/check-client-provenance.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PROVENANCE = 'vendor/developmentfinance-client.provenance.json';
const PACKAGE_NAME = '@developmentfinance/client';
const SHA = /^[0-9a-f]{40}$/;
const SUBJECT_SHA = /\bsdk ([0-9a-f]{7,40})\b/;

const failures = [];
const fail = (message) => failures.push(message);

const provenance = JSON.parse(readFileSync(path.join(ROOT, PROVENANCE), 'utf8'));
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

// The provenance names the tarball package.json installs.
const spec = pkg.dependencies?.[PACKAGE_NAME] ?? '';
const installed = spec.startsWith('file:vendor/') ? spec.slice('file:vendor/'.length) : null;
if (installed === null) {
    fail(`package.json does not install ${PACKAGE_NAME} from file:vendor/ (found "${spec}")`);
} else if (provenance.package !== installed) {
    fail(`${PROVENANCE} names "${provenance.package}" but package.json installs "${installed}"`);
}
const tarball = `vendor/${provenance.package}`;
if (!existsSync(path.join(ROOT, tarball))) {
    fail(`${tarball} does not exist`);
}

// Both revisions are full commit hashes.
for (const key of ['sdk', 'spec_kit']) {
    const commit = provenance[key]?.commit;
    if (typeof commit !== 'string' || !SHA.test(commit)) {
        fail(
            `${PROVENANCE}: ${key}.commit must be a full 40-character commit hash (found ${JSON.stringify(commit)})`,
        );
    }
}

// The last commit that touched the tarball names the same sdk commit.
if (failures.length === 0) {
    const log = execFileSync('git', ['log', '-1', '--format=%H%n%s', '--', tarball], {
        cwd: ROOT,
        encoding: 'utf8',
    }).trim();
    if (log === '') {
        fail(
            `no commit touches ${tarball}; the check needs the full git history (fetch-depth: 0 in CI)`,
        );
    } else {
        const [hash, subject] = log.split('\n');
        const named = SUBJECT_SHA.exec(subject)?.[1];
        if (named === undefined) {
            fail(
                `commit ${hash.slice(0, 7)} vendored ${tarball} but its subject does not name the sdk commit ` +
                    `as "sdk <hash>": "${subject}"`,
            );
        } else if (!provenance.sdk.commit.startsWith(named)) {
            fail(
                `commit ${hash.slice(0, 7)} vendored ${tarball} at sdk ${named}, but ${PROVENANCE} records ` +
                    `sdk ${provenance.sdk.commit.slice(0, 7)}; update the provenance file with the commit the tarball was built from`,
            );
        }
    }
}

if (failures.length > 0) {
    for (const message of failures) console.error(`FAIL  ${message}`);
    process.exit(1);
}
console.log(
    `ok    ${tarball} from sdk ${provenance.sdk.commit.slice(0, 7)}, spec-kit ${provenance.spec_kit.commit.slice(0, 7)}`,
);
