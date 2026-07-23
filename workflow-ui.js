import {
    NODE_TYPES,
    normalizeWorkflow,
    validateWorkflow,
} from './workflow-graph.js';

const NODE_LABELS = {
    generation: 'Generation',
    join: 'Join',
    output: 'Output',
};

function clone(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function field(label, control) {
    const wrapper = makeElement('label', 'no-workflow-field');
    wrapper.append(makeElement('span', '', label), control);
    return wrapper;
}

export function createWorkflowEditor({
    getWorkflow,
    saveWorkflow,
    resetWorkflow,
    notify,
}) {
    let graph = null;
    let root = null;
    let viewport = null;
    let surface = null;
    let svg = null;
    let inspector = null;
    let status = null;
    let selectedId = null;
    let pendingConnection = null;
    const nodeStates = new Map();

    function persist() {
        graph = normalizeWorkflow(graph);
        saveWorkflow(clone(graph));
        renderStatus();
    }

    function renderStatus() {
        if (!status || !graph) return;
        const result = validateWorkflow(graph);
        status.classList.toggle('is-error', !result.valid);
        status.textContent = result.valid
            ? `${graph.nodes.length} nodes · ${graph.edges.length} connections · valid`
            : result.errors[0];
    }

    function uniqueNodeId(type) {
        let index = 1;
        let id = `${type}-${index}`;
        const ids = new Set(graph.nodes.map(node => node.id));
        while (ids.has(id)) id = `${type}-${++index}`;
        return id;
    }

    function addNode(type) {
        const id = uniqueNodeId(type);
        const positionOffset = graph.nodes.length * 24;
        graph.nodes.push({
            id,
            type,
            name: type === 'output' ? 'Final Response' : NODE_LABELS[type],
            prompt: type === 'join'
                ? ''
                : type === 'output'
                    ? 'Produce the final response using the connected material.\n\n{{INPUTS}}'
                    : 'Complete this stage using the connected material.\n\n{{INPUTS}}',
            separator: '\n\n',
            failurePolicy: type === 'generation' ? 'abort' : 'abort',
            environment: { preset: 'Default', api: '', model: '', customUrl: '' },
            position: {
                x: 100 + (positionOffset % 480),
                y: 100 + (positionOffset % 360),
            },
        });
        selectedId = id;
        persist();
        render();
    }

    function deleteSelected() {
        if (!selectedId) return;
        const node = graph.nodes.find(candidate => candidate.id === selectedId);
        if (!node || !window.confirm(`Delete "${node.name}" and its connections?`)) return;
        graph.nodes = graph.nodes.filter(candidate => candidate.id !== selectedId);
        graph.edges = graph.edges.filter(edge =>
            edge.from !== selectedId && edge.to !== selectedId);
        nodeStates.delete(selectedId);
        selectedId = null;
        pendingConnection = null;
        persist();
        render();
    }

    function addConnection(from, to) {
        if (!from || !to || from === to) return;
        if (graph.edges.some(edge => edge.from === from && edge.to === to)) return;
        graph.edges.push({
            id: `edge-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            from,
            to,
        });
        persist();
    }

    function removeEdge(id) {
        graph.edges = graph.edges.filter(edge => edge.id !== id);
        persist();
        render();
    }

    function port(node, direction) {
        const button = makeElement('button', `no-node-port is-${direction}`);
        button.type = 'button';
        button.title = direction === 'out'
            ? `Connect from ${node.name}`
            : `Connect into ${node.name}`;
        button.dataset.nodeId = node.id;
        button.dataset.port = direction;
        button.addEventListener('click', event => {
            event.stopPropagation();
            if (direction === 'out') {
                pendingConnection = pendingConnection === node.id ? null : node.id;
                renderNodes();
            } else if (pendingConnection) {
                addConnection(pendingConnection, node.id);
                pendingConnection = null;
                render();
            }
        });
        return button;
    }

    function beginDrag(event, node, card) {
        if (event.button !== 0 || event.target.closest('button')) return;
        event.preventDefault();
        const startX = event.clientX;
        const startY = event.clientY;
        const originX = node.position.x;
        const originY = node.position.y;
        card.setPointerCapture(event.pointerId);

        const move = moveEvent => {
            node.position.x = Math.max(0, originX + moveEvent.clientX - startX);
            node.position.y = Math.max(0, originY + moveEvent.clientY - startY);
            card.style.left = `${node.position.x}px`;
            card.style.top = `${node.position.y}px`;
            renderEdges();
        };
        const finish = finishEvent => {
            card.removeEventListener('pointermove', move);
            card.removeEventListener('pointerup', finish);
            card.removeEventListener('pointercancel', finish);
            if (card.hasPointerCapture(finishEvent.pointerId)) {
                card.releasePointerCapture(finishEvent.pointerId);
            }
            persist();
        };
        card.addEventListener('pointermove', move);
        card.addEventListener('pointerup', finish);
        card.addEventListener('pointercancel', finish);
    }

    function renderNodes() {
        if (!surface) return;
        surface.querySelectorAll('.no-workflow-node').forEach(node => node.remove());
        for (const node of graph.nodes) {
            const card = makeElement(
                'article',
                `no-workflow-node is-${node.type}`,
            );
            card.dataset.nodeId = node.id;
            card.style.left = `${node.position.x}px`;
            card.style.top = `${node.position.y}px`;
            card.classList.toggle('is-selected', node.id === selectedId);
            card.classList.toggle('is-connecting', node.id === pendingConnection);
            const runtimeState = nodeStates.get(node.id);
            if (runtimeState) card.classList.add(`is-${runtimeState}`);

            if (node.type !== 'output') card.append(port(node, 'out'));
            card.append(port(node, 'in'));

            const header = makeElement('header', 'no-node-header');
            header.append(
                makeElement('span', 'no-node-type', NODE_LABELS[node.type]),
                makeElement('b', 'no-node-title', node.name),
            );
            header.addEventListener('pointerdown', event => beginDrag(event, node, card));
            card.append(header);

            const incoming = graph.edges.filter(edge => edge.to === node.id).length;
            const outgoing = graph.edges.filter(edge => edge.from === node.id).length;
            card.append(makeElement(
                'div',
                'no-node-meta',
                `${incoming} in · ${outgoing} out`,
            ));
            card.addEventListener('click', () => {
                selectedId = node.id;
                renderNodes();
                renderInspector();
            });
            surface.append(card);
        }
        renderEdges();
    }

    function renderEdges() {
        if (!svg || !surface) return;
        svg.replaceChildren();
        const surfaceRect = surface.getBoundingClientRect();
        for (const edge of graph.edges) {
            const from = surface.querySelector(`[data-node-id="${CSS.escape(edge.from)}"]`);
            const to = surface.querySelector(`[data-node-id="${CSS.escape(edge.to)}"]`);
            if (!from || !to) continue;
            const fromRect = from.getBoundingClientRect();
            const toRect = to.getBoundingClientRect();
            const x1 = fromRect.right - surfaceRect.left;
            const y1 = fromRect.top + fromRect.height / 2 - surfaceRect.top;
            const x2 = toRect.left - surfaceRect.left;
            const y2 = toRect.top + toRect.height / 2 - surfaceRect.top;
            const bend = Math.max(60, Math.abs(x2 - x1) * 0.45);
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`);
            path.classList.add('no-workflow-edge');
            path.dataset.edgeId = edge.id;
            svg.append(path);
        }
    }

    function updateNode(key, value) {
        const node = graph.nodes.find(candidate => candidate.id === selectedId);
        if (!node) return;
        if (key.startsWith('environment.')) {
            node.environment[key.split('.')[1]] = value;
        } else {
            node[key] = value;
        }
        persist();
        renderNodes();
    }

    function input(value, onChange, className = 'text_pole') {
        const control = makeElement('input', className);
        control.value = value;
        control.addEventListener('change', () => onChange(control.value));
        return control;
    }

    function select(value, options, onChange) {
        const control = makeElement('select', 'text_pole');
        for (const [optionValue, label] of options) {
            const option = makeElement('option', '', label);
            option.value = optionValue;
            option.selected = optionValue === value;
            control.append(option);
        }
        control.addEventListener('change', () => onChange(control.value));
        return control;
    }

    function renderInspector() {
        if (!inspector) return;
        inspector.replaceChildren();
        const node = graph.nodes.find(candidate => candidate.id === selectedId);
        if (!node) {
            inspector.append(
                makeElement('h3', '', 'Node settings'),
                makeElement('p', 'no-workflow-empty', 'Select a node to edit its prompt, model connection, and failure behavior.'),
            );
            return;
        }

        inspector.append(makeElement('h3', '', node.name));
        inspector.append(field('Name', input(node.name, value => updateNode('name', value))));
        inspector.append(field(
            'Type',
            select(node.type, NODE_TYPES.map(type => [type, NODE_LABELS[type]]), value => {
                updateNode('type', value);
                renderInspector();
            }),
        ));

        if (node.type === 'join') {
            inspector.append(field(
                'Join separator',
                input(node.separator, value => updateNode('separator', value)),
            ));
        } else {
            const prompt = makeElement('textarea', 'text_pole no-workflow-prompt');
            prompt.value = node.prompt;
            prompt.placeholder = 'Use {{INPUTS}} or a connected node token such as {{planner}}.';
            prompt.addEventListener('change', () => updateNode('prompt', prompt.value));
            inspector.append(field('Prompt', prompt));
            inspector.append(field(
                'Failure',
                select(node.failurePolicy, [
                    ['abort', 'Abort workflow'],
                    ['continue', 'Continue with empty output'],
                ], value => updateNode('failurePolicy', value)),
            ));
            inspector.append(makeElement('h4', '', 'Connection'));
            inspector.append(field(
                'Preset',
                input(node.environment.preset, value => updateNode('environment.preset', value)),
            ));
            inspector.append(field(
                'API',
                input(node.environment.api, value => updateNode('environment.api', value)),
            ));
            inspector.append(field(
                'Model',
                input(node.environment.model, value => updateNode('environment.model', value)),
            ));
            inspector.append(field(
                'Custom URL',
                input(node.environment.customUrl, value =>
                    updateNode('environment.customUrl', value)),
            ));
        }

        const incoming = graph.edges.filter(edge => edge.to === node.id);
        const outgoing = graph.edges.filter(edge => edge.from === node.id);
        inspector.append(makeElement('h4', '', 'Connections'));
        if (!incoming.length && !outgoing.length) {
            inspector.append(makeElement('small', '', 'This node is not connected.'));
        }
        for (const edge of [...incoming, ...outgoing]) {
            const otherId = edge.from === node.id ? edge.to : edge.from;
            const other = graph.nodes.find(candidate => candidate.id === otherId);
            const row = makeElement('div', 'no-edge-row');
            row.append(makeElement(
                'span',
                '',
                `${edge.from === node.id ? 'To' : 'From'}: ${other?.name || otherId}`,
            ));
            const remove = makeElement('button', 'menu_button', 'Remove');
            remove.type = 'button';
            remove.addEventListener('click', () => removeEdge(edge.id));
            row.append(remove);
            inspector.append(row);
        }

        const deleteButton = makeElement('button', 'menu_button no-delete-node', 'Delete node');
        deleteButton.type = 'button';
        deleteButton.addEventListener('click', deleteSelected);
        inspector.append(deleteButton);
    }

    function render() {
        renderNodes();
        renderInspector();
        renderStatus();
    }

    function exportWorkflow() {
        const blob = new Blob([`${JSON.stringify(graph, null, 2)}\n`], {
            type: 'application/json',
        });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'nemo-orchestrator-workflow.json';
        link.click();
        URL.revokeObjectURL(link.href);
    }

    function importWorkflow(file) {
        const reader = new FileReader();
        reader.addEventListener('load', () => {
            try {
                const imported = normalizeWorkflow(JSON.parse(String(reader.result)));
                const result = validateWorkflow(imported);
                if (!result.valid) throw new Error(result.errors.join(' '));
                graph = imported;
                selectedId = null;
                pendingConnection = null;
                persist();
                render();
                notify('success', 'Workflow imported.');
            } catch (error) {
                notify('error', `Could not import workflow: ${error.message}`);
            }
        });
        reader.readAsText(file);
    }

    function build() {
        root = makeElement('div', 'no-workflow-modal no-hidden');
        root.innerHTML = `
            <div class="no-workflow-shell" role="dialog" aria-modal="true" aria-label="Nemo Orchestrator workflow editor">
                <header class="no-workflow-toolbar">
                    <div>
                        <b>Fine Control Workflow</b>
                        <small>Connect outputs on the right to inputs on the left.</small>
                    </div>
                    <div class="no-workflow-actions">
                        <button type="button" class="menu_button" data-action="add-generation">+ Generation</button>
                        <button type="button" class="menu_button" data-action="add-join">+ Join</button>
                        <button type="button" class="menu_button" data-action="add-output">+ Output</button>
                        <button type="button" class="menu_button" data-action="import">Import</button>
                        <button type="button" class="menu_button" data-action="export">Export</button>
                        <button type="button" class="menu_button" data-action="reset">Reset</button>
                        <button type="button" class="menu_button" data-action="close" aria-label="Close workflow editor">×</button>
                    </div>
                </header>
                <div class="no-workflow-main">
                    <div class="no-workflow-viewport">
                        <div class="no-workflow-surface">
                            <svg class="no-workflow-lines" aria-hidden="true"></svg>
                        </div>
                    </div>
                    <aside class="no-workflow-inspector"></aside>
                </div>
                <footer class="no-workflow-footer">
                    <span class="no-workflow-status"></span>
                    <small>Parallel branches are dependency-aware and safely serialized while SillyTavern connection settings remain global.</small>
                </footer>
                <input type="file" accept="application/json,.json" class="no-workflow-file no-hidden">
            </div>`;
        document.body.append(root);
        viewport = root.querySelector('.no-workflow-viewport');
        surface = root.querySelector('.no-workflow-surface');
        svg = root.querySelector('.no-workflow-lines');
        inspector = root.querySelector('.no-workflow-inspector');
        status = root.querySelector('.no-workflow-status');
        const fileInput = root.querySelector('.no-workflow-file');

        root.querySelector('[data-action="add-generation"]').addEventListener('click', () =>
            addNode('generation'));
        root.querySelector('[data-action="add-join"]').addEventListener('click', () =>
            addNode('join'));
        root.querySelector('[data-action="add-output"]').addEventListener('click', () =>
            addNode('output'));
        root.querySelector('[data-action="export"]').addEventListener('click', exportWorkflow);
        root.querySelector('[data-action="import"]').addEventListener('click', () =>
            fileInput.click());
        fileInput.addEventListener('change', () => {
            if (fileInput.files?.[0]) importWorkflow(fileInput.files[0]);
            fileInput.value = '';
        });
        root.querySelector('[data-action="reset"]').addEventListener('click', () => {
            if (!window.confirm('Reset Fine Control to the maintained default workflow?')) return;
            graph = normalizeWorkflow(resetWorkflow());
            selectedId = null;
            pendingConnection = null;
            persist();
            render();
        });
        root.querySelector('[data-action="close"]').addEventListener('click', close);
        root.addEventListener('click', event => {
            if (event.target === root) close();
        });
        viewport.addEventListener('scroll', renderEdges, { passive: true });
        window.addEventListener('resize', renderEdges);
    }

    function open() {
        if (!root) build();
        graph = normalizeWorkflow(getWorkflow());
        selectedId = null;
        pendingConnection = null;
        root.classList.remove('no-hidden');
        document.body.classList.add('no-workflow-open');
        render();
    }

    function close() {
        root?.classList.add('no-hidden');
        document.body.classList.remove('no-workflow-open');
        pendingConnection = null;
    }

    function setNodeState(nodeId, state) {
        nodeStates.set(nodeId, state);
        if (root && !root.classList.contains('no-hidden')) renderNodes();
    }

    function resetNodeStates() {
        nodeStates.clear();
        if (root && !root.classList.contains('no-hidden')) renderNodes();
    }

    return { close, open, resetNodeStates, setNodeState };
}
