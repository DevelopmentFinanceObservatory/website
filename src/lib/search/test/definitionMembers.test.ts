import assert from 'node:assert/strict';
import test from 'node:test';

import { definitionMembersReader } from '../definitionMembers.ts';
import type { DefinitionMembers } from '../searchClient.ts';

const envelope: DefinitionMembers = {
    members: [
        { ref: 'dcid:Count_Person_Female', label: 'Female population', roles: [], constraints: {} },
        { ref: 'dcid:Count_Person_Male', label: null, roles: [], constraints: {} },
    ],
    served_count: 2,
    family_member_count: 2,
    family_member_digest: 'sha256:ab',
};

test('definitionMembersReader reads each spec once and hands back bare dcids', async () => {
    let calls = 0;
    const read = definitionMembersReader(async () => {
        calls += 1;
        return envelope;
    });
    const spec = { spec_id: 'spec_1', definition: {}, shape: { member_digest: 'sha256:ab' } };

    assert.deepEqual(await read(spec), {
        ok: true,
        members: [
            { dcid: 'Count_Person_Female', label: 'Female population' },
            { dcid: 'Count_Person_Male', label: null },
        ],
    });
    await read(spec);
    assert.equal(calls, 1);
});

test('definitionMembersReader reports a failed read and asks again next time', async () => {
    let calls = 0;
    const read = definitionMembersReader(async () => {
        calls += 1;
        if (calls === 1) throw new Error('scope_too_broad');
        return envelope;
    });
    const spec = { spec_id: 'spec_1', shape: { member_digest: 'sha256:ab' } };

    assert.deepEqual(await read(spec), { ok: false });
    assert.equal((await read(spec)).ok, true);
    assert.equal(calls, 2);
});

test('definitionMembersReader asks again when the digest changes under the same spec_id', async () => {
    let calls = 0;
    const read = definitionMembersReader(async () => {
        calls += 1;
        return envelope;
    });

    await read({ spec_id: 'spec_1', shape: { member_digest: 'sha256:ab' } });
    await read({ spec_id: 'spec_1', shape: { member_digest: 'sha256:cd' } });
    assert.equal(calls, 2);
    await read({ spec_id: 'spec_1', shape: { member_digest: 'sha256:ab' } });
    assert.equal(calls, 2);
});

test('definitionMembersReader shares one in-flight read per digest', async () => {
    let calls = 0;
    const read = definitionMembersReader(async () => {
        calls += 1;
        return envelope;
    });
    const spec = { spec_id: 'spec_1', shape: { member_digest: 'sha256:ab' } };

    await Promise.all([read(spec), read(spec)]);
    assert.equal(calls, 1);
});

test('definitionMembersReader does not cache a Spec without a digest', async () => {
    let calls = 0;
    const read = definitionMembersReader(async () => {
        calls += 1;
        return envelope;
    });

    await read({ spec_id: 'spec_1', shape: { member_digest: null } });
    await read({ spec_id: 'spec_1', shape: {} });
    await read({ spec_id: 'spec_1' });
    assert.equal(calls, 3);
});
