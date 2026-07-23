import { chooseWeighted, fillRequiredTemplate } from './orchestrator-utils.js';

export const DEFAULT_WRITER_TEMPLATE = `[OOC: Follow the response blueprint below while preserving established character voice, lore, user autonomy, and scene continuity. Do not mention the blueprint. Write only the next in-character response.

# RESPONSE BLUEPRINT
{{BLUEPRINT}}]`;

export const DEFAULT_EDITOR_TEMPLATE = `[OOC: Revise the draft below without changing its events, characterization, point of view, or intended meaning. Remove repetition, awkward phrasing, and grammatical errors. Preserve natural dialogue and quiet moments. Output only the revised response.

# DRAFT
{{WRITER_PROSE}}]`;

export function createOrchestrationController({
    getSettings,
    captureEnvironment,
    restoreEnvironment,
    clearInjections,
    installInjections,
    runPlanningPipeline,
    applyStageEnvironment,
    applyWriterChaosEnvironment,
    executeGen,
    runFineWorkflow,
    notify,
    logger = console,
    random = Math.random,
}) {
    let running = false;
    let pendingEnvironment = null;
    let pipelineSequence = 0;
    let finalizationPromise = null;
    let activePreparationController = null;

    async function restorePendingEnvironment() {
        const snapshot = pendingEnvironment;
        pendingEnvironment = null;
        if (!snapshot) return;

        try {
            await restoreEnvironment(snapshot);
        } catch (error) {
            logger.error('[NemoOrchestrator] Failed to restore the original environment.', error);
            notify('error', `Could not restore the original SillyTavern connection: ${error.message}`);
        }
    }

    async function finishPipelineGeneration() {
        if (finalizationPromise) {
            await finalizationPromise;
            return;
        }
        if (!pendingEnvironment) return;

        finalizationPromise = (async () => {
            try {
                await clearInjections();
            } catch (error) {
                logger.error('[NemoOrchestrator] Failed to clear injections.', error);
            }
            await restorePendingEnvironment();
        })();

        try {
            await finalizationPromise;
        } finally {
            finalizationPromise = null;
        }
    }

    async function cancelPipelineAndFinish() {
        pipelineSequence += 1;
        activePreparationController?.abort(new Error('Orchestration cancelled.'));
        if (pendingEnvironment || finalizationPromise) {
            await finishPipelineGeneration();
            return;
        }

        try {
            await clearInjections();
        } catch (error) {
            logger.error('[NemoOrchestrator] Failed to clear injections.', error);
        }
    }

    async function runPipeline() {
        const currentSettings = getSettings();
        if (!currentSettings.enabled || running) return false;

        running = true;
        const sequence = ++pipelineSequence;
        const abortController = new AbortController();
        activePreparationController = abortController;
        let snapshot = null;
        const assertActive = () => {
            if (
                abortController.signal.aborted ||
                sequence !== pipelineSequence ||
                !getSettings().enabled
            ) {
                const error = new Error('Orchestration was cancelled before preparation finished.');
                error.name = 'AbortError';
                throw error;
            }
        };

        try {
            await finishPipelineGeneration();

            snapshot = await captureEnvironment();
            assertActive();
            await clearInjections();

            if (getSettings().workflowMode === 'fine') {
                if (typeof runFineWorkflow !== 'function') {
                    throw new Error('Fine Control workflow execution is unavailable.');
                }
                const result = await runFineWorkflow({
                    workflow: getSettings().visualWorkflow,
                    assertActive,
                    signal: abortController.signal,
                });
                if (!result?.instruction?.trim()) {
                    throw new Error('The Fine Control workflow returned no final instruction.');
                }
                assertActive();
                await installInjections(result.instruction);
                assertActive();

                pendingEnvironment = snapshot;
                snapshot = null;
                notify('success', `Workflow prepared through ${result.outputNode?.name || 'Output'}.`);
                return true;
            }

            const blueprint = await runPlanningPipeline();
            if (!blueprint?.trim()) throw new Error('The planning stages returned no blueprint.');
            assertActive();

            const writerTemplate = getSettings().gremlinWriterInstructionsTemplate?.trim() ||
                DEFAULT_WRITER_TEMPLATE;
            const editorTemplate = getSettings().gremlinAuditorInstructionsTemplate?.trim() ||
                DEFAULT_EDITOR_TEMPLATE;
            let finalInstruction;

            if (getSettings().gremlinAuditorEnabled) {
                const option = getSettings().gremlinWriterChaosModeEnabled
                    ? chooseWeighted(getSettings().gremlinWriterChaosOptions ?? [], random)
                    : null;
                let writerReady = option
                    ? await applyWriterChaosEnvironment(option)
                    : await applyStageEnvironment('writer');
                if (option && !writerReady) {
                    notify(
                        'warning',
                        'Writer Chaos option failed; using the standard Writer environment.',
                    );
                    writerReady = await applyStageEnvironment('writer');
                }
                if (!writerReady) {
                    throw new Error('The Writer environment could not be configured.');
                }
                assertActive();

                const writerInstruction = fillRequiredTemplate(
                    writerTemplate,
                    'BLUEPRINT',
                    blueprint,
                    'RESPONSE BLUEPRINT',
                );
                const draft = await executeGen(writerInstruction);
                if (!draft?.trim()) throw new Error('The Writer returned no draft.');
                assertActive();
                if (!await applyStageEnvironment('auditor')) {
                    throw new Error('The Editor environment could not be configured.');
                }
                assertActive();
                finalInstruction = fillRequiredTemplate(
                    editorTemplate,
                    'WRITER_PROSE',
                    draft,
                    'DRAFT',
                );
            } else {
                if (!await applyStageEnvironment('writer')) {
                    throw new Error('The Writer environment could not be configured.');
                }
                assertActive();
                finalInstruction = fillRequiredTemplate(
                    writerTemplate,
                    'BLUEPRINT',
                    blueprint,
                    'RESPONSE BLUEPRINT',
                );
            }

            assertActive();
            await installInjections(finalInstruction);
            assertActive();

            pendingEnvironment = snapshot;
            snapshot = null;
            notify('success', 'Response plan prepared.');
            return true;
        } catch (error) {
            if (error.name === 'AbortError') {
                logger.info('[NemoOrchestrator] Pipeline preparation cancelled.');
            } else {
                logger.error('[NemoOrchestrator] Pipeline failed.', error);
                notify('error', `Pipeline failed: ${error.message}`);
            }
            try {
                await clearInjections();
            } catch (cleanupError) {
                logger.error(
                    '[NemoOrchestrator] Failed to clear injections after an error.',
                    cleanupError,
                );
            }
            return false;
        } finally {
            if (activePreparationController === abortController) {
                activePreparationController = null;
            }
            running = false;
            if (snapshot) {
                try {
                    await restoreEnvironment(snapshot);
                } catch (error) {
                    logger.error(
                        '[NemoOrchestrator] Failed to restore after a pipeline error.',
                        error,
                    );
                    notify(
                        'error',
                        `Could not restore the original SillyTavern connection: ${error.message}`,
                    );
                }
            }
        }
    }

    function getState() {
        return {
            running,
            hasPendingEnvironment: Boolean(pendingEnvironment),
            isFinalizing: Boolean(finalizationPromise),
        };
    }

    return {
        cancelPipelineAndFinish,
        finishPipelineGeneration,
        getState,
        runPipeline,
    };
}
