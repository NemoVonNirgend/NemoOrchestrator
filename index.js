import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings, getContext } from '../../../extensions.js';
import {
    applyGremlinEnvironment,
    applyGremlinWriterChaosOption,
    executeGen,
    runGremlinPlanningPipeline,
} from './pipeline.js';
import { importLegacySettings } from './migration.js';

const EXTENSION_NAME = 'NemoOrchestrator';
const EXTENSION_PATH = `scripts/extensions/third-party/${EXTENSION_NAME}`;
const ROLE_KEYS = ['papa', 'twins', 'mama', 'writer', 'auditor'];

const DEFAULT_WRITER_TEMPLATE = `[OOC: Follow the response blueprint below while preserving established character voice, lore, user autonomy, and scene continuity. Do not mention the blueprint. Write only the next in-character response.

# RESPONSE BLUEPRINT
{{BLUEPRINT}}]`;

const DEFAULT_EDITOR_TEMPLATE = `[OOC: Revise the draft below without changing its events, characterization, point of view, or intended meaning. Remove repetition, awkward phrasing, and grammatical errors. Preserve natural dialogue and quiet moments. Output only the revised response.

# DRAFT
{{WRITER_PROSE}}]`;

const defaults = {
    enabled: false,
    gremlinPapaEnabled: true,
    gremlinTwinsEnabled: true,
    gremlinMamaEnabled: true,
    gremlinAuditorEnabled: false,
    gremlinTwinsIterations: 1,
    gremlinWriterChaosModeEnabled: false,
    gremlinWriterChaosOptions: [],
    gremlinWriterInstructionsTemplate: '',
    gremlinAuditorInstructionsTemplate: '',
    migrationVersion: 0,
    migratedFromProsePolisher: false,
};

for (const role of ROLE_KEYS) {
    const roleName = role[0].toUpperCase() + role.slice(1);
    defaults[`gremlin${roleName}Preset`] = 'Default';
    defaults[`gremlin${roleName}Api`] = '';
    defaults[`gremlin${roleName}Model`] = '';
    defaults[`gremlin${roleName}Source`] = '';
    defaults[`gremlin${roleName}CustomUrl`] = '';
}

let running = false;

function settings() {
    return extension_settings[EXTENSION_NAME];
}

function notify(level, message) {
    window.toastr?.[level]?.(message, 'Nemo Orchestrator');
}

function chooseWeighted(options) {
    const valid = options.filter(option => Number(option.weight) > 0);
    const total = valid.reduce((sum, option) => sum + Number(option.weight), 0);
    if (!total) return null;
    let cursor = Math.random() * total;
    return valid.find(option => (cursor -= Number(option.weight)) <= 0) ?? valid.at(-1);
}

async function clearInjections() {
    await getContext().executeSlashCommands(
        '/inject id=nemo_orchestrator_plan remove | /inject id=nemo_orchestrator_adherence remove',
    );
}

async function runPipeline() {
    if (!settings().enabled || running) return;
    running = true;

    try {
        await clearInjections();
        const blueprint = await runGremlinPlanningPipeline();
        if (!blueprint?.trim()) throw new Error('The planning stages returned no blueprint.');

        const writerTemplate = settings().gremlinWriterInstructionsTemplate || DEFAULT_WRITER_TEMPLATE;
        const editorTemplate = settings().gremlinAuditorInstructionsTemplate || DEFAULT_EDITOR_TEMPLATE;
        let finalInstruction;

        if (settings().gremlinAuditorEnabled) {
            const option = settings().gremlinWriterChaosModeEnabled
                ? chooseWeighted(settings().gremlinWriterChaosOptions ?? [])
                : null;
            const writerReady = option
                ? await applyGremlinWriterChaosOption(option)
                : await applyGremlinEnvironment('writer');
            if (!writerReady) throw new Error('The Writer environment could not be configured.');

            const draft = await executeGen(writerTemplate.replaceAll('{{BLUEPRINT}}', blueprint));
            if (!draft?.trim()) throw new Error('The Writer returned no draft.');
            if (!await applyGremlinEnvironment('auditor')) {
                throw new Error('The Editor environment could not be configured.');
            }
            finalInstruction = editorTemplate.replaceAll('{{WRITER_PROSE}}', draft);
        } else {
            if (!await applyGremlinEnvironment('writer')) {
                throw new Error('The Writer environment could not be configured.');
            }
            finalInstruction = writerTemplate.replaceAll('{{BLUEPRINT}}', blueprint);
        }

        const context = getContext();
        const adherence = JSON.stringify(
            '[System: Follow the response plan supplied in the next instruction.]',
        );
        const plan = JSON.stringify(finalInstruction);
        await context.executeSlashCommands(
            `/inject id=nemo_orchestrator_adherence position=chat depth=0 ${adherence} | ` +
            `/inject id=nemo_orchestrator_plan position=chat depth=2 ${plan}`,
        );
        notify('success', 'Response plan prepared.');
    } catch (error) {
        console.error('[NemoOrchestrator] Pipeline failed.', error);
        notify('error', `Pipeline failed: ${error.message}`);
        await clearInjections();
    } finally {
        running = false;
        getContext().reloadGenerationSettings?.();
    }
}

function bindBoolean(id, key) {
    const element = document.getElementById(id);
    if (!element) return;
    element.checked = Boolean(settings()[key]);
    element.addEventListener('change', () => {
        settings()[key] = element.checked;
        saveSettingsDebounced();
        updateUi();
    });
}

function bindValue(id, key, transform = value => value) {
    const element = document.getElementById(id);
    if (!element) return;
    element.value = settings()[key] ?? '';
    element.addEventListener('change', () => {
        settings()[key] = transform(element.value);
        saveSettingsDebounced();
    });
}

function updateUi() {
    const enabled = settings().enabled;
    document.getElementById('no_status')?.classList.toggle('is-enabled', enabled);
    const toggle = document.getElementById('no_toggle');
    if (toggle) {
        toggle.classList.toggle('active', enabled);
        toggle.title = `Nemo Orchestrator: ${enabled ? 'On' : 'Off'}`;
    }
}

function bindRole(role) {
    const name = role[0].toUpperCase() + role.slice(1);
    bindValue(`no_${role}_preset`, `gremlin${name}Preset`);
    bindValue(`no_${role}_api`, `gremlin${name}Api`);
    bindValue(`no_${role}_model`, `gremlin${name}Model`);
}

async function initialize() {
    extension_settings[EXTENSION_NAME] = {
        ...defaults,
        ...extension_settings[EXTENSION_NAME],
    };
    const migration = importLegacySettings(
        extension_settings,
        extension_settings[EXTENSION_NAME],
    );
    if (migration.imported) {
        saveSettingsDebounced();
        notify('success', `Imported ${migration.count} Project Gremlin settings from Prose Polisher.`);
    }

    const html = await fetch(`${EXTENSION_PATH}/settings.html`).then(response => response.text());
    document.getElementById('extensions_settings')?.insertAdjacentHTML('beforeend', html);

    bindBoolean('no_enabled', 'enabled');
    bindBoolean('no_planner_enabled', 'gremlinPapaEnabled');
    bindBoolean('no_explorers_enabled', 'gremlinTwinsEnabled');
    bindBoolean('no_synthesizer_enabled', 'gremlinMamaEnabled');
    bindBoolean('no_editor_enabled', 'gremlinAuditorEnabled');
    bindValue('no_explorer_iterations', 'gremlinTwinsIterations', value => Number(value));
    bindValue('no_planner_prompt', 'gremlinPapaInstructions');
    bindValue('no_character_explorer_prompt', 'gremlinTwinsVexInstructionsBase');
    bindValue('no_scene_explorer_prompt', 'gremlinTwinsVaxInstructionsBase');
    bindValue('no_synthesizer_prompt', 'gremlinMamaInstructions');
    bindValue('no_writer_prompt', 'gremlinWriterInstructionsTemplate');
    bindValue('no_editor_prompt', 'gremlinAuditorInstructionsTemplate');
    ROLE_KEYS.forEach(bindRole);

    const button = document.createElement('button');
    button.id = 'no_toggle';
    button.className = 'fa-solid fa-diagram-project';
    button.addEventListener('click', async () => {
        settings().enabled = !settings().enabled;
        saveSettingsDebounced();
        if (!settings().enabled) await clearInjections();
        updateUi();
        notify('info', settings().enabled ? 'Enabled.' : 'Disabled.');
    });
    document.getElementById('send_but_holder')?.parentElement?.insertBefore(
        button,
        document.getElementById('send_but_holder')?.nextSibling,
    );

    updateUi();
    eventSource.makeLast(event_types.USER_MESSAGE_RENDERED, runPipeline);
    eventSource.on(event_types.chat_id_changed, clearInjections);
}

eventSource.on(event_types.APP_READY, initialize);
