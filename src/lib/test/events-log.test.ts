import assert from 'node:assert/strict';
import test from 'node:test';

import { logEvent } from '../events/eventLog.ts';

// Replaces console.log and console.error for one call; returns what each received.
const capture = (run: () => void) => {
    const realLog = console.log;
    const realError = console.error;
    const logged: string[] = [];
    const errors: unknown[][] = [];
    console.log = (line: string) => logged.push(line);
    console.error = (...args: unknown[]) => errors.push(args);

    try {
        run();
    } finally {
        console.log = realLog;
        console.error = realError;
    }

    return { logged, errors };
};

test('one JSON line carries the name, props, page and signed-in flag, and no id', () => {
    // The whole Who, as track() passes it: the log takes only the user's presence and the page.
    const who = { userId: 'u-456', visitorId: 'v-123', page: '/data', headers: null };
    const { logged } = capture(() =>
        logEvent('search.query', { traceId: 'abc123', query: 'aid to Kenya' }, who),
    );

    assert.equal(logged.length, 1);
    assert.deepEqual(JSON.parse(logged[0]), {
        severity: 'INFO',
        message: 'event',
        name: 'search.query',
        props: { traceId: 'abc123', query: 'aid to Kenya' },
        page: '/data',
        signedIn: true,
    });
    assert.ok(!logged[0].includes('u-456') && !logged[0].includes('v-123'));
});

test('the page keeps its path and drops a query string or fragment', () => {
    const pages = ['/roadmap?tab=requests#new', '/data?q=aid%20to%20Kenya', '/docs#events'];
    const { logged } = capture(() => {
        for (const page of pages) {
            logEvent('feedback.submit', {}, { page });
        }
    });

    assert.deepEqual(
        logged.map((line) => JSON.parse(line).page),
        ['/roadmap', '/data', '/docs'],
    );
});

test('an anonymous event with no page logs signedIn false and a null page', () => {
    const { logged } = capture(() => logEvent('embed.view', {}, {}));

    const entry = JSON.parse(logged[0]);
    assert.equal(entry.signedIn, false);
    assert.equal(entry.page, null);
});

test('props that cannot be serialised are reported and do not throw', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    const { logged, errors } = capture(() => logEvent('search.query', circular, {}));

    assert.equal(logged.length, 0);
    assert.equal(errors.length, 1);
});
