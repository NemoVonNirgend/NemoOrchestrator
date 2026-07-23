import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyEnvironment,
    buildEnvironmentCommands,
    captureEnvironment,
    normalizeStageEnvironment,
    restoreEnvironment,
} from '../environment.js';

test('environment normalization supports legacy aliases and trims values', () => {
    assert.deepEqual(normalizeStageEnvironment({
        api: '  makersuite ',
        model: ' gemini-test ',
        preset: ' Creative ',
        customUrl: ' https://example.test/v1 ',
    }), {
        api: 'google',
        model: 'gemini-test',
        preset: 'Creative',
        customUrl: 'https://example.test/v1',
    });
    assert.equal(normalizeStageEnvironment({ api: 'mistralai' }).api, 'mistral');
    assert.equal(normalizeStageEnvironment({ api: 'textgenerationwebui' }).api, 'ooba');
});

test('unknown API mappings fail before changing the environment', () => {
    assert.throws(
        () => buildEnvironmentCommands({ api: 'definitely-not-an-api' }),
        /Unknown API mapping/,
    );
});

test('environment commands use safe order and current STscript syntax', () => {
    assert.deepEqual(buildEnvironmentCommands({
        api: 'custom',
        customUrl: 'https://host.test/v1',
        preset: 'My "Preset"',
        model: 'model/name',
    }), [
        '/api-url api=custom connect=false quiet=true "https://host.test/v1"',
        '/api quiet=true "custom"',
        '/preset "My \\"Preset\\""',
        '/model quiet=true "model/name"',
    ]);
});

test('default and empty settings leave the current environment untouched', () => {
    assert.deepEqual(buildEnvironmentCommands({ preset: 'Default' }), []);
    assert.deepEqual(buildEnvironmentCommands({ customUrl: 'https://unused.test' }), []);
});

test('environment application executes commands sequentially and stops on error', async () => {
    const scripts = [];
    const context = {
        async executeSlashCommandsWithOptions(script) {
            scripts.push(script);
            if (script.startsWith('/preset')) {
                return { isError: true, errorMessage: 'Missing preset' };
            }
            return { pipe: '' };
        },
    };

    await assert.rejects(
        applyEnvironment({
            api: 'openrouter',
            preset: 'Missing',
            model: 'never-reached',
        }, context),
        /Missing preset/,
    );
    assert.deepEqual(scripts, [
        '/api quiet=true "openrouter" |',
        '/preset "Missing" |',
    ]);
});

test('environment capture includes custom URL only for a custom API', async () => {
    const scripts = [];
    const context = {
        async executeSlashCommandsWithOptions(script) {
            scripts.push(script);
            return {
                pipe: {
                    '/api |': 'custom',
                    '/preset |': 'Current',
                    '/model |': 'model-a',
                    '/api-url api=custom |': 'https://host.test/v1',
                }[script],
            };
        },
    };

    assert.deepEqual(await captureEnvironment(context), {
        api: 'custom',
        preset: 'Current',
        model: 'model-a',
        customUrl: 'https://host.test/v1',
    });
    assert.deepEqual(scripts, [
        '/api |',
        '/preset |',
        '/model |',
        '/api-url api=custom |',
    ]);
});

test('environment restoration reapplies a snapshot and reloads generation settings', async () => {
    const scripts = [];
    let reloads = 0;
    const context = {
        async executeSlashCommandsWithOptions(script) {
            scripts.push(script);
            return { pipe: '' };
        },
        reloadGenerationSettings() {
            reloads += 1;
        },
    };

    await restoreEnvironment({
        api: 'openai',
        preset: 'Original',
        model: 'original-model',
        customUrl: '',
    }, context);

    assert.deepEqual(scripts, [
        '/api quiet=true "openai" |',
        '/preset "Original" |',
        '/model quiet=true "original-model" |',
    ]);
    assert.equal(reloads, 1);
});
