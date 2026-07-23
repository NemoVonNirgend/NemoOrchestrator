import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CHARACTER_EXPLORER_PROMPT,
    PLANNER_PROMPT,
    SCENE_EXPLORER_PROMPT,
    SYNTHESIZER_PROMPT,
} from '../stage-prompts.js';

test('every planning prompt explicitly protects user autonomy', () => {
    for (const prompt of [
        PLANNER_PROMPT,
        CHARACTER_EXPLORER_PROMPT,
        SCENE_EXPLORER_PROMPT,
        SYNTHESIZER_PROMPT,
    ]) {
        assert.match(prompt.toLowerCase(), /user autonomy/);
    }
});

test('default prompts reject forced escalation and performative prose', () => {
    assert.match(PLANNER_PROMPT, /Do not force escalation/);
    assert.match(PLANNER_PROMPT, /Characters do not need to perform/);
    assert.match(CHARACTER_EXPLORER_PROMPT, /theatrical body language/);
    assert.match(SCENE_EXPLORER_PROMPT, /arbitrary twist/);
    assert.match(SYNTHESIZER_PROMPT, /characters who are not constantly performing/);
});

test('Synthesizer prompt retains required source placeholders', () => {
    assert.match(SYNTHESIZER_PROMPT, /\{\{BLUEPRINT\}\}/);
    assert.match(SYNTHESIZER_PROMPT, /\{\{TWIN_DELIBERATIONS\}\}/);
});
