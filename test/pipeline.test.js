import test from 'node:test';
import assert from 'node:assert/strict';
import { runPlanningPipeline } from '../pipeline.js';

function makeSettings(overrides = {}) {
    return {
        enabled: true,
        gremlinPapaEnabled: true,
        gremlinTwinsEnabled: true,
        gremlinMamaEnabled: true,
        gremlinTwinsIterations: 1,
        gremlinPapaInstructions: '',
        gremlinTwinsVexInstructionsBase: '',
        gremlinTwinsVaxInstructionsBase: '',
        gremlinMamaInstructions: '',
        ...overrides,
    };
}

function quietNotify() {}
const quietLogger = { warn() {} };

test('disabled orchestration performs no planning work', async () => {
    let calls = 0;
    const result = await runPlanningPipeline({
        settings: makeSettings({ enabled: false }),
        applyStage: async () => {
            calls += 1;
            return true;
        },
        generate: async () => {
            calls += 1;
            return 'unused';
        },
        notify: quietNotify,
        logger: quietLogger,
    });

    assert.equal(result, null);
    assert.equal(calls, 0);
});

test('full planning pipeline applies stages in order and grounds synthesis', async () => {
    const stages = [];
    const prompts = [];
    const responses = [
        'Planner result',
        'Character note',
        'Scene note',
        'Synthesized result',
    ];
    const result = await runPlanningPipeline({
        settings: makeSettings(),
        applyStage: async role => {
            stages.push(role);
            return true;
        },
        generate: async prompt => {
            prompts.push(prompt);
            return responses.shift();
        },
        notify: quietNotify,
        logger: quietLogger,
    });

    assert.equal(result, 'Synthesized result');
    assert.deepEqual(stages, ['papa', 'twins', 'mama']);
    assert.equal(prompts.length, 4);
    assert.match(prompts[1], /Planner result/);
    assert.match(prompts[2], /Character note/);
    assert.match(prompts[3], /Planner result/);
    assert.match(prompts[3], /Character note/);
    assert.match(prompts[3], /Scene note/);
});

test('Planner environment and empty-output failures abort the pipeline', async () => {
    await assert.rejects(
        runPlanningPipeline({
            settings: makeSettings(),
            applyStage: async role => role !== 'papa',
            generate: async () => 'unused',
            notify: quietNotify,
            logger: quietLogger,
        }),
        /Planner environment/,
    );

    await assert.rejects(
        runPlanningPipeline({
            settings: makeSettings(),
            applyStage: async () => true,
            generate: async () => '   ',
            notify: quietNotify,
            logger: quietLogger,
        }),
        /Planner returned no response plan/,
    );
});

test('Explorer environment failure skips optional calls and continues', async () => {
    const stages = [];
    const prompts = [];
    const result = await runPlanningPipeline({
        settings: makeSettings(),
        applyStage: async role => {
            stages.push(role);
            return role !== 'twins';
        },
        generate: async prompt => {
            prompts.push(prompt);
            return prompts.length === 1 ? 'Planner result' : 'Synthesized result';
        },
        notify: quietNotify,
        logger: quietLogger,
    });

    assert.equal(result, 'Synthesized result');
    assert.deepEqual(stages, ['papa', 'twins', 'mama']);
    assert.equal(prompts.length, 2);
    assert.match(prompts[1], /None\./);
});

test('individual Explorer failures do not discard successful notes', async () => {
    const result = await runPlanningPipeline({
        settings: makeSettings({ gremlinMamaEnabled: false }),
        applyStage: async () => true,
        generate: async prompt => {
            if (prompt.includes('Plan the next AI-controlled response')) return 'Planner result';
            if (prompt.includes('Character Explorer task')) throw new Error('Character failed');
            return 'Scene note';
        },
        notify: quietNotify,
        logger: quietLogger,
    });

    assert.match(result, /Planner result/);
    assert.match(result, /Scene Explorer, round 1/);
    assert.match(result, /Scene note/);
    assert.doesNotMatch(result, /Character Explorer, round 1/);
});

test('Synthesizer environment, generation, and empty-output failures use fallback plans', async () => {
    for (const scenario of ['environment', 'throw', 'empty']) {
        let call = 0;
        const result = await runPlanningPipeline({
            settings: makeSettings({ gremlinTwinsEnabled: false }),
            applyStage: async role => scenario !== 'environment' || role !== 'mama',
            generate: async () => {
                call += 1;
                if (call === 1) return 'Planner result';
                if (scenario === 'throw') throw new Error('Synth failed');
                if (scenario === 'empty') return '';
                return 'unused';
            },
            notify: quietNotify,
            logger: quietLogger,
        });

        assert.match(result, /Source plan \(Planner\)/);
        assert.match(result, /Planner result/);
    }
});

test('Explorer rounds clamp to three and produce six optional calls', async () => {
    let explorerCalls = 0;
    await runPlanningPipeline({
        settings: makeSettings({
            gremlinPapaEnabled: false,
            gremlinMamaEnabled: false,
            gremlinTwinsIterations: 99,
        }),
        applyStage: async () => true,
        generate: async () => {
            explorerCalls += 1;
            return `Note ${explorerCalls}`;
        },
        notify: quietNotify,
        logger: quietLogger,
    });

    assert.equal(explorerCalls, 6);
});

test('custom Synthesizer prompts cannot omit the source plan or explorer notes', async () => {
    let synthesizerPrompt = '';
    let call = 0;
    await runPlanningPipeline({
        settings: makeSettings({
            gremlinTwinsEnabled: false,
            gremlinMamaInstructions: 'Use conservative editorial judgment.',
        }),
        applyStage: async () => true,
        generate: async prompt => {
            call += 1;
            if (call === 1) return 'Planner result';
            synthesizerPrompt = prompt;
            return 'Synthesized result';
        },
        notify: quietNotify,
        logger: quietLogger,
    });

    assert.match(synthesizerPrompt, /^Use conservative editorial judgment\./);
    assert.match(synthesizerPrompt, /# SOURCE PLAN\nPlanner result/);
    assert.match(synthesizerPrompt, /# OPTIONAL EXPLORER NOTES\nNone\./);
});
