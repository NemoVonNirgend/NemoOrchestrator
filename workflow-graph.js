export const WORKFLOW_VERSION = 2;
export const NODE_TYPES = Object.freeze([
    'context',
    'generation',
    'template',
    'condition',
    'join',
    'output',
]);
export const FAILURE_POLICIES = Object.freeze(['abort', 'continue']);
export const CONDITION_OPERATORS = Object.freeze([
    'contains',
    'not-contains',
    'equals',
    'not-equals',
    'matches',
    'not-matches',
    'empty',
    'not-empty',
]);
export const CONTEXT_SOURCES = Object.freeze([
    'latest-user',
    'last-assistant',
    'chat-history',
    'character-card',
    'persona',
]);

function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function cleanEnvironment(environment = {}) {
    return {
        preset: String(environment.preset || ''),
        api: String(environment.api || ''),
        model: String(environment.model || ''),
        customUrl: String(environment.customUrl || ''),
    };
}

function normalizeNode(node, index) {
    const type = NODE_TYPES.includes(node?.type) ? node.type : 'generation';
    return {
        id: String(node?.id || `node-${index + 1}`),
        type,
        name: String(node?.name || `Node ${index + 1}`),
        prompt: String(node?.prompt || ''),
        separator: String(node?.separator || '\n\n'),
        failurePolicy: FAILURE_POLICIES.includes(node?.failurePolicy)
            ? node.failurePolicy
            : 'abort',
        environment: cleanEnvironment(node?.environment),
        contextSource: CONTEXT_SOURCES.includes(node?.contextSource)
            ? node.contextSource
            : 'latest-user',
        messageLimit: Math.min(
            100,
            Math.max(1, Number.parseInt(node?.messageLimit, 10) || 12),
        ),
        condition: {
            operator: CONDITION_OPERATORS.includes(node?.condition?.operator)
                ? node.condition.operator
                : 'contains',
            value: String(node?.condition?.value || ''),
            caseSensitive: Boolean(node?.condition?.caseSensitive),
        },
        position: {
            x: Number.isFinite(Number(node?.position?.x)) ? Number(node.position.x) : 80,
            y: Number.isFinite(Number(node?.position?.y)) ? Number(node.position.y) : 80,
        },
    };
}

export function normalizeWorkflow(workflow) {
    const source = workflow && typeof workflow === 'object' ? workflow : {};
    const nodes = Array.isArray(source.nodes)
        ? source.nodes.map(normalizeNode)
        : [];
    const nodeIds = new Set(nodes.map(node => node.id));
    const edgeIds = new Set();
    const edges = [];

    for (const [index, edge] of (Array.isArray(source.edges) ? source.edges : []).entries()) {
        const from = String(edge?.from || '');
        const to = String(edge?.to || '');
        if (!nodeIds.has(from) || !nodeIds.has(to) || from === to) continue;
        let id = String(edge?.id || `edge-${index + 1}`);
        while (edgeIds.has(id)) id = `${id}-${index + 1}`;
        edgeIds.add(id);
        const source = nodes.find(node => node.id === from);
        const sourceHandle = source?.type === 'condition' &&
            ['true', 'false'].includes(edge?.sourceHandle)
            ? edge.sourceHandle
            : 'out';
        edges.push({ id, from, to, sourceHandle });
    }

    return {
        version: WORKFLOW_VERSION,
        name: String(source.name || 'Untitled workflow'),
        nodes,
        edges,
    };
}

export function validateWorkflow(workflow) {
    const graph = normalizeWorkflow(workflow);
    const errors = [];
    const ids = new Set();

    if (!graph.nodes.length) errors.push('The workflow has no nodes.');
    for (const node of graph.nodes) {
        if (ids.has(node.id)) errors.push(`Duplicate node id: ${node.id}`);
        ids.add(node.id);
        if (!node.name.trim()) errors.push(`Node ${node.id} has no name.`);
        if (['generation', 'template', 'output'].includes(node.type) && !node.prompt.trim()) {
            errors.push(`${node.name} has no prompt.`);
        }
    }

    const outgoing = new Map(graph.nodes.map(node => [node.id, []]));
    const incoming = new Map(graph.nodes.map(node => [node.id, []]));
    for (const edge of graph.edges) {
        outgoing.get(edge.from)?.push(edge.to);
        incoming.get(edge.to)?.push(edge.from);
    }

    const outputs = graph.nodes.filter(node => node.type === 'output');
    if (outputs.length !== 1) {
        errors.push(`The workflow requires exactly one Output node; found ${outputs.length}.`);
    } else {
        const output = outputs[0];
        if (!incoming.get(output.id)?.length) {
            errors.push('The Output node must receive at least one connection.');
        }
        if (outgoing.get(output.id)?.length) {
            errors.push('The Output node cannot connect to another node.');
        }
        const reachesOutput = new Set([output.id]);
        const queue = [output.id];
        while (queue.length) {
            const target = queue.shift();
            for (const source of incoming.get(target) || []) {
                if (reachesOutput.has(source)) continue;
                reachesOutput.add(source);
                queue.push(source);
            }
        }
        const disconnected = graph.nodes
            .filter(node => !reachesOutput.has(node.id))
            .map(node => node.name);
        if (disconnected.length) {
            errors.push(`Nodes not connected to Output: ${disconnected.join(', ')}.`);
        }
    }

    const schedule = buildExecutionBatches(graph);
    if (schedule.cyclic.length) {
        errors.push(`The workflow contains a cycle involving: ${schedule.cyclic.join(', ')}.`);
    }
    for (const node of graph.nodes) {
        if (node.type === 'join' && !incoming.get(node.id)?.length) {
            errors.push(`${node.name} must receive at least one connection.`);
        }
        if (node.type === 'condition') {
            if (!incoming.get(node.id)?.length) {
                errors.push(`${node.name} must receive at least one connection.`);
            }
            const conditionEdges = graph.edges.filter(edge => edge.from === node.id);
            if (!conditionEdges.length) {
                errors.push(`${node.name} must connect a true or false branch.`);
            }
            if (conditionEdges.some(edge => !['true', 'false'].includes(edge.sourceHandle))) {
                errors.push(`${node.name} has an invalid conditional connection.`);
            }
            if (
                !['empty', 'not-empty'].includes(node.condition.operator) &&
                !node.condition.value
            ) {
                errors.push(`${node.name} requires a comparison value.`);
            }
            if (
                ['matches', 'not-matches'].includes(node.condition.operator) &&
                node.condition.value
            ) {
                try {
                    new RegExp(
                        node.condition.value,
                        node.condition.caseSensitive ? '' : 'i',
                    );
                } catch {
                    errors.push(`${node.name} contains an invalid regular expression.`);
                }
            }
        }
        if (node.type === 'context' && incoming.get(node.id)?.length) {
            errors.push(`${node.name} is a source and cannot receive connections.`);
        }
    }

    return { valid: errors.length === 0, errors, workflow: graph };
}

export function buildExecutionBatches(workflow) {
    const graph = normalizeWorkflow(workflow);
    const indegree = new Map(graph.nodes.map(node => [node.id, 0]));
    const outgoing = new Map(graph.nodes.map(node => [node.id, []]));

    for (const edge of graph.edges) {
        indegree.set(edge.to, (indegree.get(edge.to) || 0) + 1);
        outgoing.get(edge.from)?.push(edge.to);
    }

    let ready = graph.nodes
        .filter(node => indegree.get(node.id) === 0)
        .map(node => node.id);
    const batches = [];
    const visited = new Set();

    while (ready.length) {
        const batch = [...ready];
        batches.push(batch);
        ready = [];
        for (const id of batch) {
            visited.add(id);
            for (const target of outgoing.get(id) || []) {
                indegree.set(target, indegree.get(target) - 1);
                if (indegree.get(target) === 0) ready.push(target);
            }
        }
    }

    return {
        batches,
        cyclic: graph.nodes.filter(node => !visited.has(node.id)).map(node => node.id),
    };
}

export function renderNodePrompt(node, inputs) {
    const sections = inputs.map(input => `## ${input.name}\n${input.value}`).join('\n\n');
    let prompt = String(node.prompt || '');
    let usedNamedInput = false;

    for (const input of inputs) {
        const token = `{{${input.id}}}`;
        if (prompt.includes(token)) {
            prompt = prompt.replaceAll(token, input.value);
            usedNamedInput = true;
        }
    }

    if (prompt.includes('{{INPUTS}}')) {
        return prompt.replaceAll('{{INPUTS}}', sections || 'None.');
    }
    if (inputs.length && !usedNamedInput) {
        return `${prompt.trim()}\n\n# CONNECTED INPUTS\n${sections}`;
    }
    return prompt;
}

function incomingValues(graph, nodeId, results, edgeActivity) {
    return graph.edges
        .filter(edge => edge.to === nodeId && edgeActivity.get(edge.id) !== false)
        .map(edge => {
            const source = graph.nodes.find(node => node.id === edge.from);
            return {
                id: edge.from,
                name: source?.name || edge.from,
                value: String(results.get(edge.from) || ''),
            };
        });
}

export function evaluateCondition(condition, input) {
    const source = String(input || '');
    const expected = String(condition?.value || '');
    const caseSensitive = Boolean(condition?.caseSensitive);
    const left = caseSensitive ? source : source.toLocaleLowerCase();
    const right = caseSensitive ? expected : expected.toLocaleLowerCase();

    switch (condition?.operator) {
        case 'not-contains':
            return !left.includes(right);
        case 'equals':
            return left === right;
        case 'not-equals':
            return left !== right;
        case 'matches':
        case 'not-matches': {
            const expression = new RegExp(expected, caseSensitive ? '' : 'i');
            const matches = expression.test(source);
            return condition.operator === 'matches' ? matches : !matches;
        }
        case 'empty':
            return !source.trim();
        case 'not-empty':
            return Boolean(source.trim());
        case 'contains':
        default:
            return left.includes(right);
    }
}

export async function executeWorkflow(workflow, options) {
    const validation = validateWorkflow(workflow);
    if (!validation.valid) {
        throw new Error(`Invalid workflow: ${validation.errors.join(' ')}`);
    }

    const graph = validation.workflow;
    const { batches } = buildExecutionBatches(graph);
    const results = new Map();
    const edgeActivity = new Map();
    const events = [];
    let finalNode = null;
    const runGeneration = options?.runGeneration;
    const prepareOutput = options?.prepareOutput;
    if (typeof runGeneration !== 'function' || typeof prepareOutput !== 'function') {
        throw new Error('Workflow execution requires generation and output handlers.');
    }
    if (
        graph.nodes.some(node => node.type === 'context') &&
        typeof options?.resolveContext !== 'function'
    ) {
        throw new Error('Workflow execution requires a Context node resolver.');
    }

    for (const [batchIndex, batch] of batches.entries()) {
        events.push({ type: 'batch', index: batchIndex, nodes: [...batch] });
        // SillyTavern's API, preset, and model are shared global state. Nodes in the
        // same dependency batch are concurrency-ready, but production execution is
        // serialized until generation calls can receive isolated environments.
        for (const nodeId of batch) {
            options?.assertActive?.();
            const node = graph.nodes.find(candidate => candidate.id === nodeId);
            const incomingEdges = graph.edges.filter(edge => edge.to === node.id);
            const inputs = incomingValues(graph, node.id, results, edgeActivity);
            const inactive = incomingEdges.length > 0 && inputs.length === 0;
            const outgoingEdges = graph.edges.filter(edge => edge.from === node.id);
            if (inactive) {
                results.set(node.id, '');
                for (const edge of outgoingEdges) edgeActivity.set(edge.id, false);
                options?.onNodeSkipped?.(clone(node));
                continue;
            }
            options?.onNodeStart?.(clone(node), batchIndex);

            try {
                let conditionResult = null;
                if (node.type === 'context') {
                    const value = await options?.resolveContext?.(node);
                    results.set(node.id, String(value || '').trim());
                } else if (node.type === 'join') {
                    const value = inputs.map(input => input.value).filter(Boolean)
                        .join(node.separator || '\n\n');
                    results.set(node.id, value);
                } else if (node.type === 'template') {
                    results.set(node.id, renderNodePrompt(node, inputs).trim());
                } else if (node.type === 'condition') {
                    const value = inputs.map(input => input.value).filter(Boolean)
                        .join(node.separator || '\n\n');
                    conditionResult = evaluateCondition(node.condition, value);
                    results.set(node.id, value);
                } else {
                    const prompt = renderNodePrompt(node, inputs);
                    if (node.type === 'output') {
                        await prepareOutput(node.environment, node);
                        finalNode = { node: clone(node), instruction: prompt };
                        results.set(node.id, prompt);
                    } else {
                        const value = await runGeneration(node, prompt);
                        if (!String(value || '').trim()) {
                            throw new Error(`${node.name} returned no content.`);
                        }
                        results.set(node.id, String(value).trim());
                    }
                }
                for (const edge of outgoingEdges) {
                    edgeActivity.set(
                        edge.id,
                        node.type === 'condition'
                            ? edge.sourceHandle === String(conditionResult)
                            : true,
                    );
                }
                options?.onNodeComplete?.(clone(node), results.get(node.id));
            } catch (error) {
                options?.onNodeError?.(clone(node), error);
                if (node.failurePolicy !== 'continue' || node.type === 'output') throw error;
                results.set(node.id, '');
                for (const edge of outgoingEdges) edgeActivity.set(edge.id, true);
            }
        }
    }

    if (!finalNode) throw new Error('The workflow produced no final Output instruction.');
    return {
        instruction: finalNode.instruction,
        outputNode: finalNode.node,
        results: Object.fromEntries(results),
        events,
        activeEdges: Object.fromEntries(edgeActivity),
    };
}
