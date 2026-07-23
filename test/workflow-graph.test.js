import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildExecutionBatches,
    evaluateCondition,
    executeWorkflow,
    normalizeWorkflow,
    renderNodePrompt,
    validateWorkflow,
} from '../workflow-graph.js';
import { createDefaultWorkflow } from '../workflow-defaults.js';

function smallWorkflow(overrides = {}) {
    return normalizeWorkflow({
        name: 'Test',
        nodes: [
            {
                id: 'start',
                type: 'generation',
                name: 'Start',
                prompt: 'Start prompt',
                position: { x: 0, y: 0 },
            },
            {
                id: 'left',
                type: 'generation',
                name: 'Left',
                prompt: 'Left sees {{start}}',
                failurePolicy: 'continue',
                position: { x: 200, y: 0 },
            },
            {
                id: 'right',
                type: 'generation',
                name: 'Right',
                prompt: 'Right\n{{INPUTS}}',
                position: { x: 200, y: 200 },
            },
            {
                id: 'join',
                type: 'join',
                name: 'Joined',
                separator: '\n---\n',
                position: { x: 400, y: 100 },
            },
            {
                id: 'output',
                type: 'output',
                name: 'Final',
                prompt: 'Finish from {{join}}',
                position: { x: 600, y: 100 },
            },
        ],
        edges: [
            { from: 'start', to: 'left' },
            { from: 'start', to: 'right' },
            { from: 'left', to: 'join' },
            { from: 'right', to: 'join' },
            { from: 'join', to: 'output' },
        ],
        ...overrides,
    });
}

test('default Fine Control workflow is a valid branching graph', () => {
    const graph = createDefaultWorkflow({});
    const validation = validateWorkflow(graph);

    assert.equal(validation.valid, true, validation.errors.join('\n'));
    assert.equal(graph.nodes.filter(node => node.type === 'output').length, 1);
    assert.deepEqual(buildExecutionBatches(graph).batches, [
        ['planner'],
        ['character-explorer', 'scene-explorer'],
        ['explorer-join'],
        ['synthesizer'],
        ['narrator'],
        ['editor'],
    ]);
});

test('normalization removes dangling, self-referential, and duplicate-id edges', () => {
    const graph = normalizeWorkflow({
        nodes: [
            { id: 'a', type: 'generation', name: 'A', prompt: 'A' },
            { id: 'b', type: 'output', name: 'B', prompt: 'B' },
        ],
        edges: [
            { id: 'same', from: 'a', to: 'b' },
            { id: 'same', from: 'a', to: 'b' },
            { from: 'a', to: 'a' },
            { from: 'missing', to: 'b' },
        ],
    });

    assert.equal(graph.edges.length, 2);
    assert.notEqual(graph.edges[0].id, graph.edges[1].id);
    assert.equal(graph.version, 2);
    assert.equal(graph.edges.every(edge => edge.sourceHandle === 'out'), true);
});

test('validation rejects cycles and ambiguous or disconnected outputs', () => {
    const graph = smallWorkflow();
    graph.edges.push({ id: 'cycle', from: 'join', to: 'start' });
    graph.nodes.push({
        id: 'output-two',
        type: 'output',
        name: 'Other Output',
        prompt: 'Other',
        position: { x: 0, y: 0 },
        environment: {},
        failurePolicy: 'abort',
        separator: '\n\n',
    });

    const result = validateWorkflow(graph);
    assert.equal(result.valid, false);
    assert.equal(result.errors.some(error => error.includes('exactly one Output')), true);
    assert.equal(result.errors.some(error => error.includes('cycle')), true);
});

test('validation rejects branches that never contribute to Output', () => {
    const graph = smallWorkflow();
    graph.nodes.push({
        id: 'orphan',
        type: 'generation',
        name: 'Unused branch',
        prompt: 'Waste a call',
        position: { x: 0, y: 0 },
        environment: {},
        failurePolicy: 'abort',
        separator: '\n\n',
    });

    const result = validateWorkflow(graph);
    assert.equal(result.valid, false);
    assert.equal(
        result.errors.some(error => error.includes('Unused branch')),
        true,
    );
});

test('prompt rendering supports named inputs, aggregate inputs, and safe append fallback', () => {
    const inputs = [
        { id: 'plan', name: 'Plan', value: 'Keep continuity.' },
        { id: 'notes', name: 'Notes', value: 'Use restraint.' },
    ];

    assert.equal(
        renderNodePrompt({ prompt: 'Use {{plan}}' }, inputs),
        'Use Keep continuity.',
    );
    assert.match(
        renderNodePrompt({ prompt: 'Combine:\n{{INPUTS}}' }, inputs),
        /## Notes\nUse restraint\./,
    );
    assert.match(
        renderNodePrompt({ prompt: 'No token.' }, inputs),
        /# CONNECTED INPUTS/,
    );
});

test('execution follows dependency batches and prepares one final output', async () => {
    const calls = [];
    const prepared = [];
    const result = await executeWorkflow(smallWorkflow(), {
        runGeneration: async (node, prompt) => {
            calls.push([node.id, prompt]);
            return `${node.name} result`;
        },
        prepareOutput: async (environment, node) => {
            prepared.push([environment, node.id]);
        },
    });

    assert.deepEqual(calls.map(([id]) => id), ['start', 'left', 'right']);
    assert.match(calls[1][1], /Start result/);
    assert.match(calls[2][1], /## Start\nStart result/);
    assert.match(result.results.join, /Left result\n---\nRight result/);
    assert.match(result.instruction, /Left result\n---\nRight result/);
    assert.equal(result.outputNode.id, 'output');
    assert.equal(prepared.length, 1);
});

test('continue policy leaves a failed optional branch empty', async () => {
    const errors = [];
    const result = await executeWorkflow(smallWorkflow(), {
        runGeneration: async node => {
            if (node.id === 'left') throw new Error('Optional failure');
            return `${node.name} result`;
        },
        prepareOutput: async () => {},
        onNodeError: (node, error) => errors.push([node.id, error.message]),
    });

    assert.deepEqual(errors, [['left', 'Optional failure']]);
    assert.equal(result.results.left, '');
    assert.equal(result.results.join, 'Right result');
});

test('abort policy stops before final output', async () => {
    let outputPrepared = false;
    await assert.rejects(
        executeWorkflow(smallWorkflow(), {
            runGeneration: async node => {
                if (node.id === 'right') throw new Error('Required failure');
                return 'ok';
            },
            prepareOutput: async () => {
                outputPrepared = true;
            },
        }),
        /Required failure/,
    );
    assert.equal(outputPrepared, false);
});

test('condition evaluation supports text, emptiness, and regular expressions', () => {
    assert.equal(
        evaluateCondition({ operator: 'contains', value: 'RED', caseSensitive: false }, 'red flag'),
        true,
    );
    assert.equal(
        evaluateCondition({ operator: 'not-empty' }, '  content  '),
        true,
    );
    assert.equal(
        evaluateCondition({ operator: 'matches', value: '^scene \\d+$' }, 'Scene 12'),
        true,
    );
});

test('Context, Template, and Condition nodes route only the active branch', async () => {
    const graph = normalizeWorkflow({
        name: 'Conditional context',
        nodes: [
            { id: 'context', type: 'context', name: 'Latest user' },
            {
                id: 'format',
                type: 'template',
                name: 'Reusable wrapper',
                prompt: 'REQUEST\n{{INPUTS}}',
            },
            {
                id: 'route',
                type: 'condition',
                name: 'Urgency route',
                condition: { operator: 'contains', value: 'urgent' },
            },
            {
                id: 'urgent',
                type: 'template',
                name: 'Urgent path',
                prompt: 'PRIORITIZE\n{{INPUTS}}',
            },
            {
                id: 'normal',
                type: 'template',
                name: 'Normal path',
                prompt: 'NORMAL\n{{INPUTS}}',
            },
            { id: 'join', type: 'join', name: 'Route join' },
            { id: 'output', type: 'output', name: 'Final', prompt: '{{INPUTS}}' },
        ],
        edges: [
            { from: 'context', to: 'format' },
            { from: 'format', to: 'route' },
            { from: 'route', to: 'urgent', sourceHandle: 'true' },
            { from: 'route', to: 'normal', sourceHandle: 'false' },
            { from: 'urgent', to: 'join' },
            { from: 'normal', to: 'join' },
            { from: 'join', to: 'output' },
        ],
    });
    const skipped = [];
    const result = await executeWorkflow(graph, {
        resolveContext: async () => 'This is urgent.',
        runGeneration: async () => {
            throw new Error('No generation node should run.');
        },
        prepareOutput: async () => {},
        onNodeSkipped: node => skipped.push(node.id),
    });

    assert.deepEqual(skipped, ['normal']);
    assert.match(result.results.format, /This is urgent\./);
    assert.match(result.results.urgent, /PRIORITIZE/);
    assert.equal(result.results.normal, '');
    assert.match(result.instruction, /PRIORITIZE/);
    const falseEdge = graph.edges.find(edge => edge.sourceHandle === 'false');
    assert.equal(result.activeEdges[falseEdge.id], false);
});

test('validation rejects invalid conditions and context nodes with inputs', () => {
    const graph = normalizeWorkflow({
        nodes: [
            { id: 'source', type: 'generation', name: 'Source', prompt: 'Start' },
            {
                id: 'context',
                type: 'context',
                name: 'Invalid context',
                contextSource: 'latest-user',
            },
            {
                id: 'condition',
                type: 'condition',
                name: 'Invalid regex',
                condition: { operator: 'matches', value: '[' },
            },
            { id: 'output', type: 'output', name: 'Output', prompt: '{{INPUTS}}' },
        ],
        edges: [
            { from: 'source', to: 'context' },
            { from: 'context', to: 'condition' },
            { from: 'condition', to: 'output', sourceHandle: 'true' },
        ],
    });
    const validation = validateWorkflow(graph);

    assert.equal(validation.valid, false);
    assert.equal(validation.errors.some(error => error.includes('cannot receive')), true);
    assert.equal(validation.errors.some(error => error.includes('regular expression')), true);
});

test('Context workflows require a runtime context resolver', async () => {
    const graph = normalizeWorkflow({
        nodes: [
            { id: 'context', type: 'context', name: 'Context' },
            { id: 'output', type: 'output', name: 'Output', prompt: '{{INPUTS}}' },
        ],
        edges: [{ from: 'context', to: 'output' }],
    });

    await assert.rejects(
        executeWorkflow(graph, {
            runGeneration: async () => 'unused',
            prepareOutput: async () => {},
        }),
        /Context node resolver/,
    );
});
