import {
    CHARACTER_EXPLORER_PROMPT,
    PLANNER_PROMPT,
    SCENE_EXPLORER_PROMPT,
    SYNTHESIZER_PROMPT,
} from './stage-prompts.js';
import {
    DEFAULT_EDITOR_TEMPLATE,
    DEFAULT_WRITER_TEMPLATE,
} from './orchestration-controller.js';
import { normalizeWorkflow } from './workflow-graph.js';

function roleEnvironment(settings, role) {
    const name = role[0].toUpperCase() + role.slice(1);
    return {
        preset: settings?.[`gremlin${name}Preset`] || 'Default',
        api: settings?.[`gremlin${name}Api`] || '',
        model: settings?.[`gremlin${name}Model`] || '',
        customUrl: settings?.[`gremlin${name}CustomUrl`] || '',
    };
}

export function createDefaultWorkflow(settings = {}) {
    return normalizeWorkflow({
        name: 'Narrative planning and editorial pass',
        nodes: [
            {
                id: 'planner',
                type: 'generation',
                name: 'Planner',
                prompt: settings.gremlinPapaInstructions?.trim() || PLANNER_PROMPT,
                environment: roleEnvironment(settings, 'papa'),
                failurePolicy: 'abort',
                position: { x: 80, y: 250 },
            },
            {
                id: 'character-explorer',
                type: 'generation',
                name: 'Character Explorer',
                prompt: `${settings.gremlinTwinsVexInstructionsBase?.trim() ||
                    CHARACTER_EXPLORER_PROMPT}\n\n{{INPUTS}}`,
                environment: roleEnvironment(settings, 'twins'),
                failurePolicy: 'continue',
                position: { x: 390, y: 90 },
            },
            {
                id: 'scene-explorer',
                type: 'generation',
                name: 'Scene Explorer',
                prompt: `${settings.gremlinTwinsVaxInstructionsBase?.trim() ||
                    SCENE_EXPLORER_PROMPT}\n\n{{INPUTS}}`,
                environment: roleEnvironment(settings, 'twins'),
                failurePolicy: 'continue',
                position: { x: 390, y: 410 },
            },
            {
                id: 'explorer-join',
                type: 'join',
                name: 'Explorer Notes',
                separator: '\n\n',
                position: { x: 700, y: 250 },
            },
            {
                id: 'synthesizer',
                type: 'generation',
                name: 'Synthesizer',
                prompt: (settings.gremlinMamaInstructions?.trim() || SYNTHESIZER_PROMPT)
                    .replaceAll('{{BLUEPRINT}}', '{{planner}}')
                    .replaceAll('{{TWIN_DELIBERATIONS}}', '{{explorer-join}}'),
                environment: roleEnvironment(settings, 'mama'),
                failurePolicy: 'abort',
                position: { x: 1010, y: 250 },
            },
            {
                id: 'narrator',
                type: 'generation',
                name: 'Narrator',
                prompt: (settings.gremlinWriterInstructionsTemplate?.trim() ||
                    DEFAULT_WRITER_TEMPLATE)
                    .replaceAll('{{BLUEPRINT}}', '{{synthesizer}}'),
                environment: roleEnvironment(settings, 'writer'),
                failurePolicy: 'abort',
                position: { x: 1320, y: 250 },
            },
            {
                id: 'editor',
                type: 'output',
                name: 'Editor / Final Response',
                prompt: (settings.gremlinAuditorInstructionsTemplate?.trim() ||
                    DEFAULT_EDITOR_TEMPLATE)
                    .replaceAll('{{WRITER_PROSE}}', '{{narrator}}'),
                environment: roleEnvironment(settings, 'auditor'),
                failurePolicy: 'abort',
                position: { x: 1630, y: 250 },
            },
        ],
        edges: [
            { id: 'planner-character', from: 'planner', to: 'character-explorer' },
            { id: 'planner-scene', from: 'planner', to: 'scene-explorer' },
            { id: 'character-join', from: 'character-explorer', to: 'explorer-join' },
            { id: 'scene-join', from: 'scene-explorer', to: 'explorer-join' },
            { id: 'planner-synth', from: 'planner', to: 'synthesizer' },
            { id: 'join-synth', from: 'explorer-join', to: 'synthesizer' },
            { id: 'synth-narrator', from: 'synthesizer', to: 'narrator' },
            { id: 'narrator-editor', from: 'narrator', to: 'editor' },
        ],
    });
}
