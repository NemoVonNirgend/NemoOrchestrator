import test from 'node:test';
import assert from 'node:assert/strict';
import { importLegacySettings } from '../migration.js';

test('legacy Prose Polisher settings import once and are deeply cloned', () => {
    const options = [{ api: 'openrouter', model: 'writer-a', weight: 2 }];
    const extensionSettings = {
        ProsePolisher: {
            projectGremlinEnabled: true,
            gremlinPapaModel: 'planner-a',
            gremlinWriterChaosOptions: options,
        },
    };
    const target = { migrationVersion: 0 };

    assert.deepEqual(importLegacySettings(extensionSettings, target), {
        imported: true,
        count: 3,
    });
    assert.equal(target.enabled, true);
    assert.equal(target.gremlinPapaModel, 'planner-a');
    assert.deepEqual(target.gremlinWriterChaosOptions, options);
    assert.notEqual(target.gremlinWriterChaosOptions, options);
    assert.equal(target.migratedFromProsePolisher, true);
    assert.deepEqual(importLegacySettings(extensionSettings, target), {
        imported: false,
        count: 0,
    });
});

test('existing Orchestrator settings take precedence over legacy values', () => {
    const extensionSettings = {
        ProsePolisher: {
            projectGremlinEnabled: true,
            gremlinPapaModel: 'legacy-model',
            gremlinWriterModel: 'legacy-writer',
        },
    };
    const target = {
        enabled: false,
        gremlinPapaModel: 'current-model',
        migrationVersion: 0,
    };

    const result = importLegacySettings(
        extensionSettings,
        target,
        ['enabled', 'gremlinPapaModel'],
    );

    assert.deepEqual(result, { imported: true, count: 1 });
    assert.equal(target.enabled, false);
    assert.equal(target.gremlinPapaModel, 'current-model');
    assert.equal(target.gremlinWriterModel, 'legacy-writer');
});

test('missing legacy settings still complete migration idempotently', () => {
    const target = { migrationVersion: 0 };

    assert.deepEqual(importLegacySettings({}, target), {
        imported: false,
        count: 0,
    });
    assert.equal(target.migrationVersion, 1);
    assert.equal(target.migratedFromProsePolisher, false);
});

test('undefined legacy values are not imported', () => {
    const target = { migrationVersion: 0 };
    const result = importLegacySettings({
        ProsePolisher: {
            gremlinPapaModel: undefined,
        },
    }, target);

    assert.deepEqual(result, { imported: false, count: 0 });
    assert.equal('gremlinPapaModel' in target, false);
});
