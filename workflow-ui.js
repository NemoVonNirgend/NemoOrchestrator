import {
    buildExecutionBatches,
    CONDITION_OPERATORS,
    CONTEXT_SOURCES,
    NODE_TYPES,
    normalizeWorkflow,
    validateWorkflow,
} from './workflow-graph.js';

const NODE_LABELS = {
    context: 'Context',
    generation: 'Generation',
    template: 'Template',
    condition: 'Condition',
    join: 'Join',
    output: 'Output',
};

const CONTEXT_LABELS = {
    'latest-user': 'Latest user message',
    'last-assistant': 'Last assistant message',
    'chat-history': 'Recent chat history',
    'character-card': 'Character card',
    persona: 'User persona',
};

const CONDITION_LABELS = {
    contains: 'Contains',
    'not-contains': 'Does not contain',
    equals: 'Equals',
    'not-equals': 'Does not equal',
    matches: 'Matches regular expression',
    'not-matches': 'Does not match regular expression',
    empty: 'Is empty',
    'not-empty': 'Is not empty',
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
    let zoom = 1;
    let undoStack = [];
    let redoStack = [];
    let undoButton = null;
    let redoButton = null;
    let zoomLabel = null;
    let nameInput = null;
    const nodeStates = new Map();
    const SURFACE_WIDTH = 2100;
    const SURFACE_HEIGHT = 1100;

    function remember() {
        if (!graph) return;
        undoStack.push(JSON.stringify(graph));
        if (undoStack.length > 50) undoStack.shift();
        redoStack = [];
        updateHistoryButtons();
    }

    function updateHistoryButtons() {
        if (undoButton) undoButton.disabled = !undoStack.length;
        if (redoButton) redoButton.disabled = !redoStack.length;
    }

    function restoreHistory(source, destination) {
        if (!source.length) return;
        destination.push(JSON.stringify(graph));
        graph = normalizeWorkflow(JSON.parse(source.pop()));
        if (!graph.nodes.some(node => node.id === selectedId)) selectedId = null;
        pendingConnection = null;
        persist();
        render();
        if (nameInput) nameInput.value = graph.name;
        updateHistoryButtons();
    }

    function undo() {
        restoreHistory(undoStack, redoStack);
    }

    function redo() {
        restoreHistory(redoStack, undoStack);
    }

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
        remember();
        const id = uniqueNodeId(type);
        const positionOffset = graph.nodes.length * 24;
        graph.nodes.push({
            id,
            type,
            name: type === 'output' ? 'Final Response' : NODE_LABELS[type],
            prompt: ['join', 'context', 'condition'].includes(type)
                ? ''
                : type === 'output'
                    ? 'Produce the final response using the connected material.\n\n{{INPUTS}}'
                    : type === 'template'
                        ? '# COMBINED MATERIAL\n{{INPUTS}}'
                        : 'Complete this stage using the connected material.\n\n{{INPUTS}}',
            separator: '\n\n',
            failurePolicy: type === 'generation' ? 'abort' : 'abort',
            environment: { preset: 'Default', api: '', model: '', customUrl: '' },
            contextSource: 'latest-user',
            messageLimit: 12,
            condition: {
                operator: 'contains',
                value: '',
                caseSensitive: false,
            },
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
        remember();
        graph.nodes = graph.nodes.filter(candidate => candidate.id !== selectedId);
        graph.edges = graph.edges.filter(edge =>
            edge.from !== selectedId && edge.to !== selectedId);
        nodeStates.delete(selectedId);
        selectedId = null;
        pendingConnection = null;
        persist();
        render();
    }

    function addConnection(from, to, sourceHandle = 'out') {
        if (!from || !to || from === to) return;
        if (graph.edges.some(edge =>
            edge.from === from &&
            edge.to === to &&
            edge.sourceHandle === sourceHandle
        )) return;
        remember();
        graph.edges.push({
            id: `edge-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            from,
            to,
            sourceHandle,
        });
        persist();
    }

    function removeEdge(id) {
        remember();
        graph.edges = graph.edges.filter(edge => edge.id !== id);
        persist();
        render();
    }

    function port(node, direction, handle = 'out') {
        const button = makeElement(
            'button',
            `no-node-port is-${direction} is-${handle}`,
        );
        button.type = 'button';
        button.title = direction === 'out'
            ? `Connect ${handle === 'out' ? 'from' : `${handle} from`} ${node.name}`
            : `Connect into ${node.name}`;
        button.dataset.nodeId = node.id;
        button.dataset.port = direction;
        button.dataset.handle = handle;
        button.addEventListener('click', event => {
            event.stopPropagation();
            if (direction === 'out') {
                const same = pendingConnection?.nodeId === node.id &&
                    pendingConnection?.handle === handle;
                pendingConnection = same ? null : { nodeId: node.id, handle };
                renderNodes();
            } else if (pendingConnection) {
                addConnection(
                    pendingConnection.nodeId,
                    node.id,
                    pendingConnection.handle,
                );
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
        remember();
        card.setPointerCapture(event.pointerId);

        const move = moveEvent => {
            node.position.x = Math.max(
                0,
                originX + (moveEvent.clientX - startX) / zoom,
            );
            node.position.y = Math.max(
                0,
                originY + (moveEvent.clientY - startY) / zoom,
            );
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
        const batches = buildExecutionBatches(graph).batches;
        const batchByNode = new Map();
        for (const [index, batch] of batches.entries()) {
            for (const id of batch) {
                batchByNode.set(id, {
                    number: index + 1,
                    parallel: batch.length > 1,
                });
            }
        }
        for (const node of graph.nodes) {
            const card = makeElement(
                'article',
                `no-workflow-node is-${node.type}`,
            );
            card.dataset.nodeId = node.id;
            card.style.left = `${node.position.x}px`;
            card.style.top = `${node.position.y}px`;
            card.classList.toggle('is-selected', node.id === selectedId);
            card.classList.toggle('is-connecting', node.id === pendingConnection?.nodeId);
            const runtimeState = nodeStates.get(node.id);
            if (runtimeState) card.classList.add(`is-${runtimeState}`);

            if (node.type === 'condition') {
                card.append(port(node, 'out', 'true'), port(node, 'out', 'false'));
            } else if (node.type !== 'output') {
                card.append(port(node, 'out'));
            }
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
            const batch = batchByNode.get(node.id);
            const step = batch
                ? `Step ${batch.number}${batch.parallel ? ' · parallel-ready' : ''}`
                : 'Unscheduled';
            card.append(makeElement(
                'div',
                'no-node-meta',
                `${step}\n${incoming} in · ${outgoing} out`,
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
            const sourcePort = from.querySelector(
                `[data-port="out"][data-handle="${CSS.escape(edge.sourceHandle || 'out')}"]`,
            );
            const fromRect = (sourcePort || from).getBoundingClientRect();
            const toRect = to.getBoundingClientRect();
            const x1 = (fromRect.right - surfaceRect.left) / zoom;
            const y1 = (fromRect.top + fromRect.height / 2 - surfaceRect.top) / zoom;
            const x2 = (toRect.left - surfaceRect.left) / zoom;
            const y2 = (toRect.top + toRect.height / 2 - surfaceRect.top) / zoom;
            const bend = Math.max(60, Math.abs(x2 - x1) * 0.45);
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`);
            path.classList.add('no-workflow-edge');
            if (['true', 'false'].includes(edge.sourceHandle)) {
                path.classList.add(`is-${edge.sourceHandle}`);
            }
            path.dataset.edgeId = edge.id;
            svg.append(path);
        }
    }

    function updateNode(key, value) {
        const node = graph.nodes.find(candidate => candidate.id === selectedId);
        if (!node) return;
        remember();
        if (key.startsWith('environment.')) {
            node.environment[key.split('.')[1]] = value;
        } else if (key.startsWith('condition.')) {
            node.condition[key.split('.')[1]] = value;
        } else {
            node[key] = value;
        }
        persist();
        renderNodes();
    }

    function duplicateSelected() {
        const source = graph.nodes.find(candidate => candidate.id === selectedId);
        if (!source) return;
        remember();
        const copy = clone(source);
        copy.id = uniqueNodeId(source.type);
        copy.name = `${source.name} copy`;
        copy.position = {
            x: source.position.x + 45,
            y: source.position.y + 45,
        };
        graph.nodes.push(copy);
        selectedId = copy.id;
        persist();
        render();
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
                makeElement('p', 'no-workflow-empty', 'Select a node to edit its data source, prompt, routing, or model connection.'),
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

        if (node.type === 'context') {
            inspector.append(field(
                'Context source',
                select(
                    node.contextSource,
                    CONTEXT_SOURCES.map(source => [source, CONTEXT_LABELS[source]]),
                    value => {
                        updateNode('contextSource', value);
                        renderInspector();
                    },
                ),
            ));
            if (node.contextSource === 'chat-history') {
                const limit = input(
                    node.messageLimit,
                    value => updateNode(
                        'messageLimit',
                        Math.min(100, Math.max(1, Number.parseInt(value, 10) || 12)),
                    ),
                );
                limit.type = 'number';
                limit.min = '1';
                limit.max = '100';
                inspector.append(field('Messages to include', limit));
            }
        } else if (node.type === 'condition') {
            inspector.append(field(
                'Condition',
                select(
                    node.condition.operator,
                    CONDITION_OPERATORS.map(operator =>
                        [operator, CONDITION_LABELS[operator]]),
                    value => {
                        updateNode('condition.operator', value);
                        renderInspector();
                    },
                ),
            ));
            if (!['empty', 'not-empty'].includes(node.condition.operator)) {
                inspector.append(field(
                    'Comparison value',
                    input(node.condition.value, value =>
                        updateNode('condition.value', value)),
                ));
            }
            const caseSensitive = makeElement('input');
            caseSensitive.type = 'checkbox';
            caseSensitive.checked = node.condition.caseSensitive;
            caseSensitive.addEventListener('change', () =>
                updateNode('condition.caseSensitive', caseSensitive.checked));
            inspector.append(field('Case sensitive', caseSensitive));
            inspector.append(makeElement(
                'small',
                '',
                'Connect the green true port or red false port to route the input.',
            ));
        } else if (node.type === 'join') {
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
            if (['generation', 'output'].includes(node.type)) {
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
                    input(node.environment.preset, value =>
                        updateNode('environment.preset', value)),
                ));
                inspector.append(field(
                    'API',
                    input(node.environment.api, value =>
                        updateNode('environment.api', value)),
                ));
                inspector.append(field(
                    'Model',
                    input(node.environment.model, value =>
                        updateNode('environment.model', value)),
                ));
                inspector.append(field(
                    'Custom URL',
                    input(node.environment.customUrl, value =>
                        updateNode('environment.customUrl', value)),
                ));
            }
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
        const duplicateButton = makeElement('button', 'menu_button', 'Duplicate node');
        duplicateButton.type = 'button';
        duplicateButton.addEventListener('click', duplicateSelected);
        const nodeActions = makeElement('div', 'no-node-actions');
        nodeActions.append(duplicateButton, deleteButton);
        inspector.append(nodeActions);
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
                remember();
                graph = imported;
                selectedId = null;
                pendingConnection = null;
                persist();
                render();
                if (nameInput) nameInput.value = graph.name;
                notify('success', 'Workflow imported.');
            } catch (error) {
                notify('error', `Could not import workflow: ${error.message}`);
            }
        });
        reader.readAsText(file);
    }

    function setZoom(nextZoom, anchor = null) {
        const previous = zoom;
        zoom = Math.min(1.6, Math.max(0.4, Number(nextZoom) || 1));
        surface.style.transform = `scale(${zoom})`;
        surface.parentElement.style.width = `${SURFACE_WIDTH * zoom}px`;
        surface.parentElement.style.height = `${SURFACE_HEIGHT * zoom}px`;
        if (zoomLabel) zoomLabel.textContent = `${Math.round(zoom * 100)}%`;

        if (anchor && viewport) {
            const contentX = (viewport.scrollLeft + anchor.x) / previous;
            const contentY = (viewport.scrollTop + anchor.y) / previous;
            viewport.scrollLeft = contentX * zoom - anchor.x;
            viewport.scrollTop = contentY * zoom - anchor.y;
        }
        requestAnimationFrame(renderEdges);
    }

    function fitWorkflow() {
        if (!graph.nodes.length || !viewport) {
            setZoom(1);
            return;
        }
        const minX = Math.min(...graph.nodes.map(node => node.position.x));
        const minY = Math.min(...graph.nodes.map(node => node.position.y));
        const maxX = Math.max(...graph.nodes.map(node => node.position.x + 240));
        const maxY = Math.max(...graph.nodes.map(node => node.position.y + 125));
        const padding = 80;
        const width = maxX - minX + padding * 2;
        const height = maxY - minY + padding * 2;
        const availableWidth = Math.max(320, viewport.clientWidth);
        const availableHeight = Math.max(240, viewport.clientHeight);
        setZoom(Math.min(1.2, availableWidth / width, availableHeight / height));
        viewport.scrollLeft = Math.max(0, (minX - padding) * zoom);
        viewport.scrollTop = Math.max(0, (minY - padding) * zoom);
    }

    function resetView() {
        setZoom(1);
        viewport.scrollTo({ left: 0, top: 0 });
    }

    function beginPan(event) {
        if (event.target.closest('.no-workflow-node') || event.button > 1) return;
        event.preventDefault();
        const startX = event.clientX;
        const startY = event.clientY;
        const startLeft = viewport.scrollLeft;
        const startTop = viewport.scrollTop;
        viewport.setPointerCapture(event.pointerId);
        viewport.classList.add('is-panning');

        const move = moveEvent => {
            viewport.scrollLeft = startLeft - (moveEvent.clientX - startX);
            viewport.scrollTop = startTop - (moveEvent.clientY - startY);
        };
        const finish = finishEvent => {
            viewport.removeEventListener('pointermove', move);
            viewport.removeEventListener('pointerup', finish);
            viewport.removeEventListener('pointercancel', finish);
            if (viewport.hasPointerCapture(finishEvent.pointerId)) {
                viewport.releasePointerCapture(finishEvent.pointerId);
            }
            viewport.classList.remove('is-panning');
        };
        viewport.addEventListener('pointermove', move);
        viewport.addEventListener('pointerup', finish);
        viewport.addEventListener('pointercancel', finish);
    }

    function build() {
        root = makeElement('div', 'no-workflow-modal no-hidden');
        root.tabIndex = -1;
        root.innerHTML = `
            <div class="no-workflow-shell" role="dialog" aria-modal="true" aria-label="Nemo Orchestrator workflow editor">
                <header class="no-workflow-toolbar">
                    <div>
                        <input class="text_pole no-workflow-name" aria-label="Workflow name">
                        <small>Connect outputs on the right to inputs on the left.</small>
                    </div>
                    <div class="no-workflow-actions">
                        <button type="button" class="menu_button" data-action="undo" title="Undo">↶</button>
                        <button type="button" class="menu_button" data-action="redo" title="Redo">↷</button>
                        <button type="button" class="menu_button" data-action="add-generation">+ Generation</button>
                        <button type="button" class="menu_button" data-action="add-context">+ Context</button>
                        <button type="button" class="menu_button" data-action="add-template">+ Template</button>
                        <button type="button" class="menu_button" data-action="add-condition">+ Condition</button>
                        <button type="button" class="menu_button" data-action="add-join">+ Join</button>
                        <button type="button" class="menu_button" data-action="add-output">+ Output</button>
                        <button type="button" class="menu_button" data-action="zoom-out" title="Zoom out">−</button>
                        <button type="button" class="menu_button no-zoom-label" data-action="reset-view" title="Reset view">100%</button>
                        <button type="button" class="menu_button" data-action="zoom-in" title="Zoom in">+</button>
                        <button type="button" class="menu_button" data-action="fit">Fit</button>
                        <button type="button" class="menu_button" data-action="import">Import</button>
                        <button type="button" class="menu_button" data-action="export">Export</button>
                        <button type="button" class="menu_button" data-action="reset">Reset</button>
                        <button type="button" class="menu_button" data-action="close" aria-label="Close workflow editor">×</button>
                    </div>
                </header>
                <div class="no-workflow-main">
                    <div class="no-workflow-viewport">
                        <div class="no-workflow-stage">
                            <div class="no-workflow-surface">
                                <svg class="no-workflow-lines" aria-hidden="true"></svg>
                            </div>
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
        nameInput = root.querySelector('.no-workflow-name');
        undoButton = root.querySelector('[data-action="undo"]');
        redoButton = root.querySelector('[data-action="redo"]');
        zoomLabel = root.querySelector('.no-zoom-label');
        const fileInput = root.querySelector('.no-workflow-file');

        undoButton.addEventListener('click', undo);
        redoButton.addEventListener('click', redo);
        root.querySelector('[data-action="add-generation"]').addEventListener('click', () =>
            addNode('generation'));
        root.querySelector('[data-action="add-context"]').addEventListener('click', () =>
            addNode('context'));
        root.querySelector('[data-action="add-template"]').addEventListener('click', () =>
            addNode('template'));
        root.querySelector('[data-action="add-condition"]').addEventListener('click', () =>
            addNode('condition'));
        root.querySelector('[data-action="add-join"]').addEventListener('click', () =>
            addNode('join'));
        root.querySelector('[data-action="add-output"]').addEventListener('click', () =>
            addNode('output'));
        root.querySelector('[data-action="export"]').addEventListener('click', exportWorkflow);
        root.querySelector('[data-action="zoom-out"]').addEventListener('click', () =>
            setZoom(zoom - 0.1, {
                x: viewport.clientWidth / 2,
                y: viewport.clientHeight / 2,
            }));
        root.querySelector('[data-action="zoom-in"]').addEventListener('click', () =>
            setZoom(zoom + 0.1, {
                x: viewport.clientWidth / 2,
                y: viewport.clientHeight / 2,
            }));
        root.querySelector('[data-action="reset-view"]').addEventListener('click', resetView);
        root.querySelector('[data-action="fit"]').addEventListener('click', fitWorkflow);
        nameInput.addEventListener('change', () => {
            remember();
            graph.name = nameInput.value.trim() || 'Untitled workflow';
            nameInput.value = graph.name;
            persist();
        });
        root.querySelector('[data-action="import"]').addEventListener('click', () =>
            fileInput.click());
        fileInput.addEventListener('change', () => {
            if (fileInput.files?.[0]) importWorkflow(fileInput.files[0]);
            fileInput.value = '';
        });
        root.querySelector('[data-action="reset"]').addEventListener('click', () => {
            if (!window.confirm('Reset Fine Control to the maintained default workflow?')) return;
            remember();
            graph = normalizeWorkflow(resetWorkflow());
            selectedId = null;
            pendingConnection = null;
            persist();
            render();
            nameInput.value = graph.name;
        });
        root.querySelector('[data-action="close"]').addEventListener('click', close);
        root.addEventListener('click', event => {
            if (event.target === root) close();
        });
        viewport.addEventListener('scroll', renderEdges, { passive: true });
        viewport.addEventListener('pointerdown', beginPan);
        viewport.addEventListener('wheel', event => {
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();
            const bounds = viewport.getBoundingClientRect();
            setZoom(zoom + (event.deltaY < 0 ? 0.1 : -0.1), {
                x: event.clientX - bounds.left,
                y: event.clientY - bounds.top,
            });
        }, { passive: false });
        root.addEventListener('keydown', event => {
            const editing = event.target.matches('input, textarea, select');
            if (
                !editing &&
                (event.ctrlKey || event.metaKey) &&
                event.key.toLowerCase() === 'z'
            ) {
                event.preventDefault();
                if (event.shiftKey) redo();
                else undo();
            } else if (!editing && (event.key === 'Delete' || event.key === 'Backspace')) {
                event.preventDefault();
                deleteSelected();
            } else if (event.key === 'Escape') {
                if (pendingConnection) {
                    pendingConnection = null;
                    renderNodes();
                } else {
                    close();
                }
            }
        });
        window.addEventListener('resize', renderEdges);
    }

    function open() {
        if (!root) build();
        graph = normalizeWorkflow(getWorkflow());
        selectedId = null;
        pendingConnection = null;
        undoStack = [];
        redoStack = [];
        root.classList.remove('no-hidden');
        document.body.classList.add('no-workflow-open');
        root.focus({ preventScroll: true });
        nameInput.value = graph.name;
        updateHistoryButtons();
        setZoom(1);
        render();
        requestAnimationFrame(fitWorkflow);
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
