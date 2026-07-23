import test from 'node:test';
import assert from 'node:assert/strict';
import {
    executeProfileGeneration,
    listConnectionProfiles,
} from '../profile-generation.js';

function makeContext(overrides = {}) {
    const calls = [];
    const profiles = [
        { id: 'profile-a', name: 'Fast Planner', api: 'openai', model: 'model-a' },
        { id: 'profile-b', name: 'Local Writer', api: 'textgenerationwebui', model: 'model-b' },
    ];
    return {
        calls,
        context: {
            extensionSettings: {
                disabledExtensions: [],
            },
            ConnectionManagerRequestService: {
                getSupportedProfiles: () => profiles,
                sendRequest: async (...args) => {
                    calls.push(args);
                    return { content: '  isolated result  ' };
                },
            },
            ...overrides,
        },
    };
}

test('supported Connection Manager profiles are exposed for the node editor', () => {
    const { context } = makeContext();
    assert.deepEqual(listConnectionProfiles(context), [
        { id: 'profile-a', name: 'Fast Planner', api: 'openai', model: 'model-a' },
        {
            id: 'profile-b',
            name: 'Local Writer',
            api: 'textgenerationwebui',
            model: 'model-b',
        },
    ]);
});

test('disabled Connection Manager returns no isolated profiles', () => {
    const { context } = makeContext();
    context.extensionSettings.disabledExtensions.push('connection-manager');
    assert.deepEqual(listConnectionProfiles(context), []);
});

test('profile generation sends an isolated non-streaming request', async () => {
    const { context, calls } = makeContext();
    const abortController = new AbortController();
    const result = await executeProfileGeneration({
        profileId: 'profile-a',
        prompt: 'Plan this scene.',
        maxTokens: 900,
        signal: abortController.signal,
        context,
    });

    assert.equal(result, 'isolated result');
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], 'profile-a');
    assert.deepEqual(calls[0][1], [{ role: 'user', content: 'Plan this scene.' }]);
    assert.equal(calls[0][2], 900);
    assert.deepEqual(calls[0][3], {
        extractData: true,
        includePreset: true,
        includeInstruct: true,
        stream: false,
        signal: abortController.signal,
    });
});

test('profile generation clamps token limits and rejects empty content', async () => {
    const { context, calls } = makeContext();
    context.ConnectionManagerRequestService.sendRequest = async (...args) => {
        calls.push(args);
        return { content: '' };
    };

    await assert.rejects(
        executeProfileGeneration({
            profileId: 'profile-a',
            prompt: 'Test',
            maxTokens: 1,
            context,
        }),
        /returned no content/,
    );
    assert.equal(calls[0][2], 128);
});

test('aborted profile errors retain cancellation semantics', async () => {
    const { context } = makeContext();
    const abortController = new AbortController();
    context.ConnectionManagerRequestService.sendRequest = async () => {
        abortController.abort();
        throw new Error('API request failed');
    };

    await assert.rejects(
        executeProfileGeneration({
            profileId: 'profile-a',
            prompt: 'Test',
            signal: abortController.signal,
            context,
        }),
        error => error.name === 'AbortError',
    );
});
