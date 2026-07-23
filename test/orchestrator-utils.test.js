import test from 'node:test';
import assert from 'node:assert/strict';
import {
    chooseWeighted,
    fillRequiredTemplate,
    fillTemplate,
    normalizeExplorerIterations,
} from '../orchestrator-utils.js';

test('weighted selection ignores unusable and non-positive options', () => {
    const valid = { api: 'openrouter', weight: 2 };
    const selected = chooseWeighted([
        null,
        { weight: 10 },
        { api: 'openai', weight: 0 },
        { model: 'model-a', weight: -1 },
        valid,
    ], () => 0.5);

    assert.equal(selected, valid);
});

test('weighted selection follows deterministic boundaries', () => {
    const first = { api: 'openai', weight: 1 };
    const second = { api: 'openrouter', weight: 3 };

    assert.equal(chooseWeighted([first, second], () => 0), first);
    assert.equal(chooseWeighted([first, second], () => 0.249), first);
    assert.equal(chooseWeighted([first, second], () => 0.25), second);
    assert.equal(chooseWeighted([first, second], () => 1), second);
});

test('explorer iterations are integer-clamped from one through three', () => {
    assert.equal(normalizeExplorerIterations(undefined), 1);
    assert.equal(normalizeExplorerIterations('0'), 1);
    assert.equal(normalizeExplorerIterations('2.9'), 2);
    assert.equal(normalizeExplorerIterations('9'), 3);
});

test('template filling replaces every known placeholder', () => {
    assert.equal(
        fillTemplate('{{A}} + {{A}} = {{B}}', { A: 'one', B: 2 }),
        'one + one = 2',
    );
});

test('required template content is appended when a custom prompt omits its placeholder', () => {
    assert.equal(
        fillRequiredTemplate('Write safely. ', 'BLUEPRINT', 'Plan A', 'RESPONSE BLUEPRINT'),
        'Write safely.\n\n# RESPONSE BLUEPRINT\nPlan A',
    );
});
