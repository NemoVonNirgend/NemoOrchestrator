import { extension_settings, getContext } from '../../../extensions.js';
import {
    CHARACTER_EXPLORER_PROMPT,
    PLANNER_PROMPT,
    SCENE_EXPLORER_PROMPT,
    SYNTHESIZER_PROMPT,
} from './stage-prompts.js';
import { applyEnvironment } from './environment.js';
import {
    fillRequiredTemplate,
    fillTemplate,
    normalizeExplorerIterations,
} from './orchestrator-utils.js';

const EXTENSION_NAME = 'NemoOrchestrator';
const LOG_PREFIX = '[NemoOrchestrator]';

function stageConfiguration(settings, role) {
    const name = role[0].toUpperCase() + role.slice(1);
    return {
        preset: settings[`gremlin${name}Preset`],
        api: settings[`gremlin${name}Api`],
        model: settings[`gremlin${name}Model`],
        customUrl: settings[`gremlin${name}CustomUrl`],
    };
}
export async function applyStageEnvironment(role, settings = extension_settings[EXTENSION_NAME]) {
    try {
        await applyEnvironment(stageConfiguration(settings, role));
        return true;
    } catch (error) {
        console.error(`${LOG_PREFIX} Failed to configure ${role} environment.`, error);
        window.toastr.error(
            `Could not configure the ${role} stage: ${error.message}`,
            'Nemo Orchestrator',
        );
        return false;
    }
}

export async function applyWriterChaosEnvironment(option) {
    try {
        await applyEnvironment(option);
        return true;
    } catch (error) {
        console.error(`${LOG_PREFIX} Failed to configure Writer Chaos environment.`, error);
        window.toastr.error(
            `Could not configure the selected Writer Chaos option: ${error.message}`,
            'Nemo Orchestrator',
        );
        return false;
    }
}

export async function applyWorkflowEnvironment(configuration) {
    try {
        await applyEnvironment(configuration);
        return true;
    } catch (error) {
        console.error(`${LOG_PREFIX} Failed to configure workflow node environment.`, error);
        window.toastr.error(
            `Could not configure the workflow node: ${error.message}`,
            'Nemo Orchestrator',
        );
        return false;
    }
}

export async function executeGen(promptText) {
    const context = getContext();

    // Using JSON.stringify is the most robust way to create a valid string literal
    // that the slash command parser can handle. It correctly escapes all necessary
    // characters (like quotes, backslashes, etc.) and wraps the result in quotes.
    const script = `/gen ${JSON.stringify(promptText)} |`;

    console.log('[NemoOrchestrator] Executing generation: /gen "..." |');
    try {
        const result = await context.executeSlashCommandsWithOptions(script, {
            showOutput: false,
            handleExecutionErrors: true,
        });
        if (result && result.isError) {
            throw new Error(`STScript execution failed during /gen: ${result.errorMessage}`);
        }
        return result.pipe || '';
    } catch (error) {
        console.error(
            `[NemoOrchestrator] Error executing generation script: "${promptText.substring(0, 100)}..."`,
            error,
        );
        window.toastr.error(
            `Nemo Orchestrator failed during generation. Error: ${error.message}`,
            'Nemo Orchestrator Generation Failed',
        );
        throw error;
    }
}

/**
 * Runs the Planner, Creative Explorer, and Synthesizer stages.
 * Assumes the user's latest message is already in context.chat.
 * @returns {Promise<string|null>} The final blueprint string, or null on failure.
 */
function combinedPlan(source, sourceLabel, explorerNotes) {
    return [
        `## Source plan (${sourceLabel})`,
        source,
        '',
        '## Optional explorer notes',
        explorerNotes || 'None.',
    ].join('\n');
}

export async function runPlanningPipeline(options = {}) {
    const settings = options.settings || extension_settings[EXTENSION_NAME];
    const applyStage = options.applyStage || (role => applyStageEnvironment(role, settings));
    const generate = options.generate || executeGen;
    const notify = options.notify || ((level, message, config) =>
        window.toastr[level](message, 'Nemo Orchestrator', config));
    const logger = options.logger || console;

    if (!settings.enabled) return null;

    const plannerPrompt = settings.gremlinPapaInstructions?.trim() || PLANNER_PROMPT;
    let blueprint = plannerPrompt;
    let blueprintSource = 'Direct response constraints';

    if (settings.gremlinPapaEnabled) {
        notify('info', 'Step 1 — Planner is drafting...', { timeOut: 7000 });
        if (!await applyStage('papa')) {
            throw new Error('The Planner environment could not be configured.');
        }
        const result = await generate(plannerPrompt);
        if (!result?.trim()) throw new Error('The Planner returned no response plan.');
        blueprint = result.trim();
        blueprintSource = 'Planner';
    }

    let explorerNotes = '';
    if (settings.gremlinTwinsEnabled) {
        notify('info', 'Step 2 — Creative Explorers are reviewing...', { timeOut: 12000 });
        if (!await applyStage('twins')) {
            notify('warning', 'Explorer environment failed; continuing without explorer notes.');
        } else {
            const characterPrompt = settings.gremlinTwinsVexInstructionsBase?.trim() ||
                CHARACTER_EXPLORER_PROMPT;
            const scenePrompt = settings.gremlinTwinsVaxInstructionsBase?.trim() ||
                SCENE_EXPLORER_PROMPT;
            const iterations = normalizeExplorerIterations(settings.gremlinTwinsIterations);

            for (let round = 1; round <= iterations; round++) {
                for (const explorer of [
                    { label: 'Character Explorer', prompt: characterPrompt },
                    { label: 'Scene Explorer', prompt: scenePrompt },
                ]) {
                    const prompt = [
                        `## Current plan (${blueprintSource})`,
                        blueprint,
                        '',
                        '## Previous optional notes',
                        explorerNotes || 'None.',
                        '',
                        `## ${explorer.label} task`,
                        explorer.prompt,
                    ].join('\n');
                    try {
                        const note = await generate(prompt);
                        if (note?.trim()) {
                            explorerNotes += `### ${explorer.label}, round ${round}\n${note.trim()}\n\n`;
                        }
                    } catch (error) {
                        logger.warn(`${LOG_PREFIX} ${explorer.label} failed; continuing.`, error);
                        notify('warning', `${explorer.label} failed; continuing without that note.`);
                    }
                }
            }
        }
    }

    const fallback = combinedPlan(blueprint, blueprintSource, explorerNotes);
    if (!settings.gremlinMamaEnabled) return fallback;

    notify('info', 'Step 3 — Synthesizer is producing the final plan...', { timeOut: 7000 });
    if (!await applyStage('mama')) {
        notify('warning', 'Synthesizer environment failed; using the combined plan.');
        return fallback;
    }

    const synthesizerTemplate = settings.gremlinMamaInstructions?.trim() || SYNTHESIZER_PROMPT;
    let synthesizerPrompt = fillRequiredTemplate(
        synthesizerTemplate,
        'BLUEPRINT',
        blueprint,
        'SOURCE PLAN',
    );
    synthesizerPrompt = fillRequiredTemplate(
        synthesizerPrompt,
        'TWIN_DELIBERATIONS',
        explorerNotes || 'None.',
        'OPTIONAL EXPLORER NOTES',
    );
    synthesizerPrompt = fillTemplate(synthesizerPrompt, {
        BLUEPRINT_SOURCE: blueprintSource,
        BLUEPRINT: blueprint,
        TWIN_DELIBERATIONS: explorerNotes || 'None.',
    });

    try {
        const result = await generate(synthesizerPrompt);
        if (!result?.trim()) {
            notify('warning', 'Synthesizer returned no plan; using the combined plan.');
            return fallback;
        }
        return result.trim();
    } catch (error) {
        logger.warn(`${LOG_PREFIX} Synthesizer failed; using the combined plan.`, error);
        notify('warning', 'Synthesizer failed; using the combined plan.');
        return fallback;
    }
}
