import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

/**
 * input-store.test.ts
 *
 * Tests input script storage operations — read, write, delete + schema validation.
 * Filesystem-dependent tests use mock.module() + dynamic import per test group.
 * Schema validation tests need no mocking (pure Zod).
 */

// ---------------------------------------------------------------------------
// readInputScripts
// ---------------------------------------------------------------------------
test('readInputScripts: returns empty array when file does not exist', async () => {
    mock.module('fs', {
        namedExports: {
            existsSync: () => false,
        },
    });
    mock.module('../../shared/runtime/paths', {
        namedExports: {
            resolveProjectPath: (...segments: string[]) => '/tmp/test-project/' + segments.join('/'),
        },
    });

    const { readInputScripts } = await import('./input-store.js');
    const result = await readInputScripts();
    assert.deepEqual(result, []);
});

test('readInputScripts: returns parsed scripts when file exists', async () => {
    const mockData = [
        { id: '001', title: 'Test Video', script: '[Visual: sunset] Narrate...' },
        { id: '002', title: 'Another', script: '[Visual: ocean] Narrate...' },
    ];
    mock.module('fs', {
        namedExports: {
            existsSync: () => true,
            readFileSync: () => JSON.stringify(mockData),
        },
    });
    mock.module('../../shared/runtime/paths', {
        namedExports: {
            resolveProjectPath: (...segments: string[]) => '/tmp/test-project/' + segments.join('/'),
        },
    });

    const { readInputScripts } = await import('./input-store.js');
    const result = await readInputScripts();
    assert.deepEqual(result, mockData);
    assert.equal(result.length, 2);
});

// ---------------------------------------------------------------------------
// writeInputScript
// ---------------------------------------------------------------------------
test('writeInputScript: adds a new script when id does not exist', async () => {
    let writtenData = '';
    const existing = [{ id: '001', title: 'Existing', script: 'Old script' }];

    mock.module('fs', {
        namedExports: {
            existsSync: () => true,
            readFileSync: () => JSON.stringify(existing),
            writeFileSync: (_path: string, data: string) => {
                writtenData = data;
            },
        },
    });
    mock.module('../../shared/runtime/paths', {
        namedExports: {
            resolveProjectPath: (...segments: string[]) => '/tmp/test-project/' + segments.join('/'),
        },
    });

    const { writeInputScript } = await import('./input-store.js');
    const newScript = { id: '002', title: 'New Video', script: '[Visual: city] New' };
    const result = await writeInputScript(newScript);

    assert.equal(result.length, 2);
    assert.ok(result.some((s: any) => s.id === '002'));
    const parsed = JSON.parse(writtenData);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[1].title, 'New Video');
});

test('writeInputScript: updates existing script when id matches', async () => {
    let writtenData = '';
    const existing = [
        { id: '001', title: 'Original Title', script: 'Original script' },
        { id: '002', title: 'Unchanged', script: 'Will stay' },
    ];

    mock.module('fs', {
        namedExports: {
            existsSync: () => true,
            readFileSync: () => JSON.stringify(existing),
            writeFileSync: (_path: string, data: string) => {
                writtenData = data;
            },
        },
    });
    mock.module('../../shared/runtime/paths', {
        namedExports: {
            resolveProjectPath: (...segments: string[]) => '/tmp/test-project/' + segments.join('/'),
        },
    });

    const { writeInputScript } = await import('./input-store.js');
    const update = { id: '001', title: 'Updated Title', script: 'Updated script' };
    const result = await writeInputScript(update);

    assert.equal(result.length, 2);
    assert.equal(result.find((s: any) => s.id === '001').title, 'Updated Title');
    assert.equal(result.find((s: any) => s.id === '001').script, 'Updated script');
    assert.equal(result.find((s: any) => s.id === '002').title, 'Unchanged');

    const parsed = JSON.parse(writtenData);
    assert.equal(parsed[0].title, 'Updated Title');
});

test('writeInputScript: handles case when no scripts file exists yet', async () => {
    let writtenData = '';
    mock.module('fs', {
        namedExports: {
            existsSync: () => false,
            writeFileSync: (_path: string, data: string) => {
                writtenData = data;
            },
        },
    });
    mock.module('../../shared/runtime/paths', {
        namedExports: {
            resolveProjectPath: (...segments: string[]) => '/tmp/test-project/' + segments.join('/'),
        },
    });

    const { writeInputScript } = await import('./input-store.js');
    const newScript = { id: '001', title: 'First', script: 'First script' };
    const result = await writeInputScript(newScript);

    assert.equal(result.length, 1);
    assert.equal(result[0].id, '001');
});

test('writeInputScript: merge-fills partial fields on update', async () => {
    let writtenData = '';
    const existing = [
        {
            id: '001',
            title: 'Old',
            script: 'Old script',
            voice: 'en-US-Wavenet-D',
            orientation: 'landscape' as const,
            showText: true,
        },
    ];

    mock.module('fs', {
        namedExports: {
            existsSync: () => true,
            readFileSync: () => JSON.stringify(existing),
            writeFileSync: (_path: string, data: string) => {
                writtenData = data;
            },
        },
    });
    mock.module('../../shared/runtime/paths', {
        namedExports: {
            resolveProjectPath: (...segments: string[]) => '/tmp/test-project/' + segments.join('/'),
        },
    });

    const { writeInputScript } = await import('./input-store.js');
    const update = { id: '001', title: 'New Title', script: 'New script' };
    const result = await writeInputScript(update);

    const updated = result.find((s: any) => s.id === '001');
    assert.equal(updated.title, 'New Title');
    assert.equal(updated.script, 'New script');
    assert.equal(updated.voice, 'en-US-Wavenet-D', 'voice should be preserved');
    assert.equal(updated.orientation, 'landscape', 'orientation should be preserved');
    assert.equal(updated.showText, true, 'showText should be preserved');
});

// ---------------------------------------------------------------------------
// deleteInputScript
// ---------------------------------------------------------------------------
test('deleteInputScript: removes script by id', async () => {
    let writtenData = '';
    const existing = [
        { id: '001', title: 'First', script: 'A' },
        { id: '002', title: 'Second', script: 'B' },
        { id: '003', title: 'Third', script: 'C' },
    ];

    mock.module('fs', {
        namedExports: {
            existsSync: () => true,
            readFileSync: () => JSON.stringify(existing),
            writeFileSync: (_path: string, data: string) => {
                writtenData = data;
            },
        },
    });
    mock.module('../../shared/runtime/paths', {
        namedExports: {
            resolveProjectPath: (...segments: string[]) => '/tmp/test-project/' + segments.join('/'),
        },
    });

    const { deleteInputScript } = await import('./input-store.js');
    const result = await deleteInputScript('002');

    assert.equal(result.length, 2);
    assert.equal(result[0].id, '001');
    assert.equal(result[1].id, '003');
    assert.ok(!result.some((s: any) => s.id === '002'));

    const parsed = JSON.parse(writtenData);
    assert.equal(parsed.length, 2);
});

test('deleteInputScript: returns same array when id does not exist', async () => {
    let writtenData = '';
    const existing = [{ id: '001', title: 'Only', script: 'Lone script' }];

    mock.module('fs', {
        namedExports: {
            existsSync: () => true,
            readFileSync: () => JSON.stringify(existing),
            writeFileSync: (_path: string, data: string) => {
                writtenData = data;
            },
        },
    });
    mock.module('../../shared/runtime/paths', {
        namedExports: {
            resolveProjectPath: (...segments: string[]) => '/tmp/test-project/' + segments.join('/'),
        },
    });

    const { deleteInputScript } = await import('./input-store.js');
    const result = await deleteInputScript('nonexistent');

    assert.equal(result.length, 1);
    assert.equal(result[0].id, '001');
});

test('deleteInputScript: works on empty scripts array', async () => {
    let writtenData = '';
    mock.module('fs', {
        namedExports: {
            existsSync: () => true,
            readFileSync: () => '[]',
            writeFileSync: (_path: string, data: string) => {
                writtenData = data;
            },
        },
    });
    mock.module('../../shared/runtime/paths', {
        namedExports: {
            resolveProjectPath: (...segments: string[]) => '/tmp/test-project/' + segments.join('/'),
        },
    });

    const { deleteInputScript } = await import('./input-store.js');
    const result = await deleteInputScript('anything');

    assert.deepEqual(result, []);
});

// ---------------------------------------------------------------------------
// validateScriptFormat — pure Zod validation, no mocking needed
// ---------------------------------------------------------------------------
test('validateScriptFormat: accepts valid script with all fields', async () => {
    const { validateScriptFormat } = await import('./input-store.js');

    const valid = {
        id: 'test-001',
        title: 'My Video',
        orientation: 'portrait' as const,
        voice: 'en-US-Wavenet-D',
        showText: true,
        script: '[Visual: sunset over ocean] The sun sets beautifully.',
        defaultVideo: 'beach.mp4',
    };

    const result = validateScriptFormat(valid);
    assert.equal(result.success, true);
    if (result.success) {
        assert.equal(result.data.id, 'test-001');
        assert.equal(result.data.title, 'My Video');
        assert.equal(result.data.orientation, 'portrait');
        assert.equal(result.data.voice, 'en-US-Wavenet-D');
        assert.equal(result.data.showText, true);
    }
});

test('validateScriptFormat: accepts landscape orientation', async () => {
    const { validateScriptFormat } = await import('./input-store.js');

    const result = validateScriptFormat({
        id: 'l-001',
        title: 'Landscape',
        orientation: 'landscape',
        script: 'Hello',
    });
    assert.equal(result.success, true);
});

test('validateScriptFormat: rejects missing required fields (id)', async () => {
    const { validateScriptFormat } = await import('./input-store.js');

    const result = validateScriptFormat({ title: 'No ID', script: 'Some script' });
    assert.equal(result.success, false);
});

test('validateScriptFormat: rejects missing required fields (title)', async () => {
    const { validateScriptFormat } = await import('./input-store.js');

    const result = validateScriptFormat({ id: 'no-title', script: 'Some script' });
    assert.equal(result.success, false);
});

test('validateScriptFormat: rejects missing required fields (script)', async () => {
    const { validateScriptFormat } = await import('./input-store.js');

    const result = validateScriptFormat({ id: 'no-script', title: 'No Script' });
    assert.equal(result.success, false);
});

test('validateScriptFormat: rejects invalid orientation value', async () => {
    const { validateScriptFormat } = await import('./input-store.js');

    const result = validateScriptFormat({
        id: 'bad-orient',
        title: 'Bad Orientation',
        script: 'Content',
        orientation: 'square',
    });
    assert.equal(result.success, false);
    if (!result.success) {
        assert.ok(result.error.issues.some((i: any) => i.path.includes('orientation')));
    }
});

test('validateScriptFormat: rejects non-string id', async () => {
    const { validateScriptFormat } = await import('./input-store.js');

    const result = validateScriptFormat({ id: 123, title: 'Numeric ID', script: 'Script' });
    assert.equal(result.success, false);
});

test('validateScriptFormat: accepts minimal valid script', async () => {
    const { validateScriptFormat } = await import('./input-store.js');

    const minimal = { id: 'min', title: 'Minimal', script: 'Just text' };
    const result = validateScriptFormat(minimal);
    assert.equal(result.success, true);
    if (result.success) {
        assert.equal(result.data.id, 'min');
        assert.equal(result.data.title, 'Minimal');
        assert.equal(result.data.script, 'Just text');
        assert.equal(result.data.orientation, undefined);
        assert.equal(result.data.voice, undefined);
        assert.equal(result.data.showText, undefined);
        assert.equal(result.data.defaultVideo, undefined);
    }
});

test('validateScriptFormat: optional fields are truly optional', async () => {
    const { validateScriptFormat } = await import('./input-store.js');

    const result = validateScriptFormat({ id: 'opt', title: 'Optional', script: 'Content' });
    assert.equal(result.success, true);
});
