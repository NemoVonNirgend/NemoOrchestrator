import { eventSource, event_types, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings, getContext } from '../../../extensions.js';
import {
    applyStageEnvironment,
    applyWriterChaosEnvironment,
    executeGen,
    runPlanningPipeline,
} from './pipeline.js';
import { captureEnvironment, restoreEnvironment } from './environment.js';
import { importLegacySettings } from './migration.js';
import { createOrchestrationController } from './orchestration-controller.js';
import { normalizeExplorerIterations } from './orchestrator-utils.js';

const EXTENSION_NAME = 'NemoOrchestrator';
const EXTENSION_PATH = `scripts/extensions/third-party/${EXTENSION_NAME}`;
const ROLE_KEYS = ['papa', 'twins', 'mama', 'writer', 'auditor'];

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

function settings() {
    return extension_settings[EXTENSION_NAME];
}

function notify(level, message) {
    window.toastr?.[level]?.(message, 'Nemo Orchestrator');
}

async function clearInjections() {
    const result = await getContext().executeSlashCommandsWithOptions(
        '/inject id=nemo_orchestrator_plan remove | /inject id=nemo_orchestrator_adherence remove',
        {
            showOutput: false,
            handleExecutionErrors: true,
        },
    );
    if (result?.isError) {
        throw new Error(result.errorMessage || 'Failed to clear Nemo Orchestrator injections.');
    }
}

async function installInjections(finalInstruction) {
    const adherence = JSON.stringify(
        '[System: Follow the response plan supplied in the next instruction.]',
    );
    const plan = JSON.stringify(finalInstruction);
    const result = await getContext().executeSlashCommandsWithOptions(
        `/inject id=nemo_orchestrator_adherence position=chat depth=0 ephemeral=true ${adherence} | ` +
            `/inject id=nemo_orchestrator_plan position=chat depth=2 ephemeral=true ${plan}`,
        {
            showOutput: false,
            handleExecutionErrors: true,
        },
    );
    if (result?.isError) {
        throw new Error(result.errorMessage || 'Failed to install the response plan.');
    }
}

const controller = createOrchestrationController({
    getSettings: settings,
    captureEnvironment,
    restoreEnvironment,
    clearInjections,
    installInjections,
    runPlanningPipeline,
    applyStageEnvironment,
    applyWriterChaosEnvironment,
    executeGen,
    notify,
});

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
    const existingSettings = extension_settings[EXTENSION_NAME] ?? {};
    const existingKeys = Object.keys(existingSettings);
    extension_settings[EXTENSION_NAME] = {
        ...defaults,
        ...existingSettings,
    };
    const migration = importLegacySettings(
        extension_settings,
        extension_settings[EXTENSION_NAME],
        existingKeys,
    );
    settings().gremlinTwinsIterations = normalizeExplorerIterations(
        settings().gremlinTwinsIterations,
    );
    if (!Array.isArray(settings().gremlinWriterChaosOptions)) {
        settings().gremlinWriterChaosOptions = [];
    }
    saveSettingsDebounced();
    if (migration.imported) {
        notify('success', `Imported ${migration.count} Project Gremlin settings from Prose Polisher.`);
    }

    const html = await fetch(`${EXTENSION_PATH}/settings.html`).then(response => response.text());
    document.getElementById('extensions_settings')?.insertAdjacentHTML('beforeend', html);

    bindBoolean('no_enabled', 'enabled');
    bindBoolean('no_planner_enabled', 'gremlinPapaEnabled');
    bindBoolean('no_explorers_enabled', 'gremlinTwinsEnabled');
    bindBoolean('no_synthesizer_enabled', 'gremlinMamaEnabled');
    bindBoolean('no_editor_enabled', 'gremlinAuditorEnabled');
    bindValue('no_explorer_iterations', 'gremlinTwinsIterations', normalizeExplorerIterations);
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
        if (!settings().enabled) {
            await controller.cancelPipelineAndFinish();
        }
        updateUi();
        notify('info', settings().enabled ? 'Enabled.' : 'Disabled.');
    });
    const rightSendForm = document.getElementById('rightSendForm');
    const sendButton = document.getElementById('send_but');
    rightSendForm?.insertBefore(button, sendButton);

    updateUi();
    eventSource.makeLast(event_types.USER_MESSAGE_RENDERED, controller.runPipeline);
    eventSource.on(event_types.GENERATION_ENDED, controller.finishPipelineGeneration);
    eventSource.on(event_types.GENERATION_STOPPED, controller.finishPipelineGeneration);
    eventSource.on(event_types.CHAT_CHANGED, controller.cancelPipelineAndFinish);
}

eventSource.on(event_types.APP_READY, initialize);
