import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWorkflowContext } from '../workflow-context.js';

function context(overrides = {}) {
    return {
        name1: 'Noah',
        name2: 'Avery',
        characterId: 0,
        groupId: null,
        chat: [
            { is_user: true, name: 'Noah', mes: 'First question' },
            { is_user: false, name: 'Avery', mes: 'First answer' },
            { is_system: true, mes: 'Hidden system event' },
            { is_user: true, name: 'Noah', mes: 'Latest question' },
        ],
        characters: [{
            name: 'Avery',
            description: 'A careful archivist.',
            personality: 'Reserved and precise.',
            scenario: 'Inside a quiet library.',
        }],
        groups: [],
        powerUserSettings: {
            persona_description: 'Noah is an investigator.',
        },
        ...overrides,
    };
}

test('context nodes resolve the latest user and assistant messages', () => {
    assert.equal(
        resolveWorkflowContext({ contextSource: 'latest-user' }, context()),
        'Latest question',
    );
    assert.equal(
        resolveWorkflowContext({ contextSource: 'last-assistant' }, context()),
        'First answer',
    );
});

test('chat history is bounded, labelled, and excludes system messages', () => {
    const result = resolveWorkflowContext(
        { contextSource: 'chat-history', messageLimit: 2 },
        context(),
    );

    assert.match(result, /## Avery\nFirst answer/);
    assert.match(result, /## Noah\nLatest question/);
    assert.doesNotMatch(result, /First question/);
    assert.doesNotMatch(result, /Hidden system event/);
});

test('character and persona sources expose maintained context fields', () => {
    const character = resolveWorkflowContext(
        { contextSource: 'character-card' },
        context(),
    );

    assert.match(character, /## Name\nAvery/);
    assert.match(character, /## Description\nA careful archivist\./);
    assert.match(character, /## Scenario\nInside a quiet library\./);
    assert.equal(
        resolveWorkflowContext({ contextSource: 'persona' }, context()),
        'Noah is an investigator.',
    );
});

test('missing context resolves to safe empty strings', () => {
    assert.equal(
        resolveWorkflowContext(
            { contextSource: 'character-card' },
            context({ characterId: undefined, characters: [] }),
        ),
        '',
    );
    assert.equal(
        resolveWorkflowContext(
            { contextSource: 'latest-user' },
            context({ chat: [] }),
        ),
        '',
    );
});
