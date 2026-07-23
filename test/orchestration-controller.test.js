import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrchestrationController } from '../orchestration-controller.js';

function makeSettings(overrides = {}) {
    return {
        enabled: true,
        gremlinAuditorEnabled: false,
        gremlinWriterChaosModeEnabled: false,
        gremlinWriterChaosOptions: [],
        gremlinWriterInstructionsTemplate: '',
        gremlinAuditorInstructionsTemplate: '',
        workflowMode: 'simple',
        visualWorkflow: null,
        ...overrides,
    };
}

function makeHarness(overrides = {}) {
    const settings = overrides.settings || makeSettings();
    const calls = {
        cleared: 0,
        installed: [],
        restored: [],
        stages: [],
        generated: [],
        notifications: [],
        logs: [],
    };
    const snapshot = { api: 'openai', preset: 'Original', model: 'model-a' };
    const controller = createOrchestrationController({
        getSettings: () => settings,
        captureEnvironment: overrides.captureEnvironment || (async () => snapshot),
        restoreEnvironment: overrides.restoreEnvironment || (async value => {
            calls.restored.push(value);
        }),
        clearInjections: overrides.clearInjections || (async () => {
            calls.cleared += 1;
        }),
        installInjections: overrides.installInjections || (async instruction => {
            calls.installed.push(instruction);
        }),
        runPlanningPipeline: overrides.runPlanningPipeline || (async () => 'Response plan'),
        applyStageEnvironment: overrides.applyStageEnvironment || (async role => {
            calls.stages.push(role);
            return true;
        }),
        applyWriterChaosEnvironment: overrides.applyWriterChaosEnvironment || (async option => {
            calls.stages.push(`chaos:${option.model}`);
            return true;
        }),
        executeGen: overrides.executeGen || (async prompt => {
            calls.generated.push(prompt);
            return 'Writer draft';
        }),
        runFineWorkflow: overrides.runFineWorkflow || (async () => ({
            instruction: 'Fine workflow instruction',
            outputNode: { name: 'Fine Output' },
        })),
        notify: (level, message) => calls.notifications.push({ level, message }),
        logger: {
            error: (...args) => calls.logs.push(['error', ...args]),
            info: (...args) => calls.logs.push(['info', ...args]),
        },
        random: overrides.random || (() => 0),
    });

    return { calls, controller, settings, snapshot };
}

test('successful preparation retains the stage environment until generation finishes', async () => {
    const { calls, controller, snapshot } = makeHarness();

    assert.equal(await controller.runPipeline(), true);
    assert.deepEqual(calls.stages, ['writer']);
    assert.equal(calls.installed.length, 1);
    assert.match(calls.installed[0], /Response plan/);
    assert.deepEqual(calls.restored, []);
    assert.equal(controller.getState().hasPendingEnvironment, true);

    await controller.finishPipelineGeneration();
    assert.deepEqual(calls.restored, [snapshot]);
    assert.equal(controller.getState().hasPendingEnvironment, false);

    await controller.finishPipelineGeneration();
    assert.equal(calls.restored.length, 1);
});

test('Fine Control delegates preparation to the graph workflow', async () => {
    const settings = makeSettings({
        workflowMode: 'fine',
        visualWorkflow: { name: 'Custom graph' },
    });
    const workflowCalls = [];
    const { calls, controller } = makeHarness({
        settings,
        runFineWorkflow: async options => {
            workflowCalls.push(options.workflow);
            options.assertActive();
            return {
                instruction: 'Graph-produced final instruction',
                outputNode: { name: 'Editorial Output' },
            };
        },
    });

    assert.equal(await controller.runPipeline(), true);
    assert.deepEqual(workflowCalls, [{ name: 'Custom graph' }]);
    assert.deepEqual(calls.stages, []);
    assert.deepEqual(calls.generated, []);
    assert.deepEqual(calls.installed, ['Graph-produced final instruction']);
    assert.equal(
        calls.notifications.some(item =>
            item.level === 'success' && item.message.includes('Editorial Output')),
        true,
    );
});

test('Fine Control failure restores the original environment', async () => {
    const settings = makeSettings({ workflowMode: 'fine', visualWorkflow: {} });
    const { calls, controller, snapshot } = makeHarness({
        settings,
        runFineWorkflow: async () => {
            throw new Error('Graph invalid');
        },
    });

    assert.equal(await controller.runPipeline(), false);
    assert.deepEqual(calls.installed, []);
    assert.deepEqual(calls.restored, [snapshot]);
    assert.match(
        calls.notifications.find(item => item.level === 'error').message,
        /Graph invalid/,
    );
});

test('Fine Control cancellation aborts isolated profile requests', async () => {
    const settings = makeSettings({ workflowMode: 'fine', visualWorkflow: {} });
    let enterWorkflow;
    const entered = new Promise(resolve => {
        enterWorkflow = resolve;
    });
    let capturedSignal;
    const { calls, controller, snapshot } = makeHarness({
        settings,
        runFineWorkflow: async ({ signal }) => {
            capturedSignal = signal;
            enterWorkflow();
            await new Promise((resolve, reject) => {
                signal.addEventListener('abort', () => {
                    const error = new Error('Profile request aborted');
                    error.name = 'AbortError';
                    reject(error);
                }, { once: true });
            });
        },
    });

    const run = controller.runPipeline();
    await entered;
    await controller.cancelPipelineAndFinish();

    assert.equal(await run, false);
    assert.equal(capturedSignal.aborted, true);
    assert.deepEqual(calls.restored, [snapshot]);
    assert.equal(
        calls.notifications.some(item => item.level === 'error'),
        false,
    );
});

test('planning failure clears injections and immediately restores the snapshot', async () => {
    const { calls, controller, snapshot } = makeHarness({
        runPlanningPipeline: async () => {
            throw new Error('Planner unavailable');
        },
    });

    assert.equal(await controller.runPipeline(), false);
    assert.deepEqual(calls.installed, []);
    assert.deepEqual(calls.restored, [snapshot]);
    assert.equal(controller.getState().hasPendingEnvironment, false);
    assert.match(
        calls.notifications.find(item => item.level === 'error').message,
        /Planner unavailable/,
    );
});

test('Writer Chaos failure falls back to Writer before the Editor stage', async () => {
    const settings = makeSettings({
        gremlinAuditorEnabled: true,
        gremlinWriterChaosModeEnabled: true,
        gremlinWriterChaosOptions: [{ model: 'chaos-model', weight: 1 }],
    });
    const { calls, controller } = makeHarness({
        settings,
        applyWriterChaosEnvironment: async option => {
            calls.stages.push(`chaos:${option.model}`);
            return false;
        },
    });

    assert.equal(await controller.runPipeline(), true);
    assert.deepEqual(calls.stages, ['chaos:chaos-model', 'writer', 'auditor']);
    assert.equal(calls.generated.length, 1);
    assert.match(calls.generated[0], /Response plan/);
    assert.match(calls.installed[0], /Writer draft/);
    assert.equal(
        calls.notifications.some(item =>
            item.level === 'warning' && item.message.includes('standard Writer')),
        true,
    );
});

test('custom Writer and Editor prompts cannot omit required content', async () => {
    const settings = makeSettings({
        gremlinAuditorEnabled: true,
        gremlinWriterInstructionsTemplate: 'Draft conservatively.',
        gremlinAuditorInstructionsTemplate: 'Edit conservatively.',
    });
    const { calls, controller } = makeHarness({ settings });

    assert.equal(await controller.runPipeline(), true);
    assert.match(calls.generated[0], /Draft conservatively\./);
    assert.match(calls.generated[0], /# RESPONSE BLUEPRINT\nResponse plan/);
    assert.match(calls.installed[0], /Edit conservatively\./);
    assert.match(calls.installed[0], /# DRAFT\nWriter draft/);
});

test('chat-change cancellation prevents late injection and restores the snapshot', async () => {
    let enterPlanning;
    let resolvePlanning;
    const planningEntered = new Promise(resolve => {
        enterPlanning = resolve;
    });
    const planningResult = new Promise(resolve => {
        resolvePlanning = resolve;
    });
    const { calls, controller, snapshot } = makeHarness({
        runPlanningPipeline: async () => {
            enterPlanning();
            return planningResult;
        },
    });

    const run = controller.runPipeline();
    await planningEntered;
    await controller.cancelPipelineAndFinish();
    resolvePlanning('Late response plan');

    assert.equal(await run, false);
    assert.deepEqual(calls.installed, []);
    assert.deepEqual(calls.restored, [snapshot]);
    assert.equal(
        calls.notifications.some(item => item.level === 'error'),
        false,
    );
});

test('a concurrent run is skipped while preparation is active', async () => {
    let enterPlanning;
    let resolvePlanning;
    const planningEntered = new Promise(resolve => {
        enterPlanning = resolve;
    });
    const planningResult = new Promise(resolve => {
        resolvePlanning = resolve;
    });
    const { controller } = makeHarness({
        runPlanningPipeline: async () => {
            enterPlanning();
            return planningResult;
        },
    });

    const first = controller.runPipeline();
    await planningEntered;
    assert.equal(await controller.runPipeline(), false);
    resolvePlanning('Response plan');
    assert.equal(await first, true);
});

test('injection failure restores immediately and leaves no pending transaction', async () => {
    const { calls, controller, snapshot } = makeHarness({
        installInjections: async () => {
            throw new Error('Injection failed');
        },
    });

    assert.equal(await controller.runPipeline(), false);
    assert.deepEqual(calls.restored, [snapshot]);
    assert.equal(controller.getState().hasPendingEnvironment, false);
    assert.match(
        calls.notifications.find(item => item.level === 'error').message,
        /Injection failed/,
    );
});

test('Writer and Editor preparation failures restore without installing a plan', async () => {
    for (const scenario of ['writer-environment', 'empty-draft', 'editor-environment']) {
        const settings = makeSettings({
            gremlinAuditorEnabled: scenario !== 'writer-environment',
        });
        const { calls, controller, snapshot } = makeHarness({
            settings,
            applyStageEnvironment: async role => {
                calls.stages.push(role);
                if (scenario === 'writer-environment' && role === 'writer') return false;
                if (scenario === 'editor-environment' && role === 'auditor') return false;
                return true;
            },
            executeGen: async prompt => {
                calls.generated.push(prompt);
                return scenario === 'empty-draft' ? '' : 'Writer draft';
            },
        });

        assert.equal(await controller.runPipeline(), false);
        assert.deepEqual(calls.installed, []);
        assert.deepEqual(calls.restored, [snapshot]);
        assert.equal(controller.getState().hasPendingEnvironment, false);
    }
});

test('overlapping finalization events share one cleanup and restoration', async () => {
    let enterRestore;
    let resolveRestore;
    const restoreEntered = new Promise(resolve => {
        enterRestore = resolve;
    });
    const restoreResult = new Promise(resolve => {
        resolveRestore = resolve;
    });
    let restoreCount = 0;
    const { controller } = makeHarness({
        restoreEnvironment: async () => {
            restoreCount += 1;
            enterRestore();
            await restoreResult;
        },
    });

    assert.equal(await controller.runPipeline(), true);
    const first = controller.finishPipelineGeneration();
    await restoreEntered;
    const second = controller.finishPipelineGeneration();
    resolveRestore();
    await Promise.all([first, second]);

    assert.equal(restoreCount, 1);
    assert.equal(controller.getState().isFinalizing, false);
});

test('restoration failures are reported without leaving a pending transaction', async () => {
    const { calls, controller } = makeHarness({
        restoreEnvironment: async () => {
            throw new Error('Restore failed');
        },
    });

    assert.equal(await controller.runPipeline(), true);
    await controller.finishPipelineGeneration();

    assert.equal(controller.getState().hasPendingEnvironment, false);
    assert.equal(
        calls.notifications.some(item =>
            item.level === 'error' && item.message.includes('Restore failed')),
        true,
    );
});
