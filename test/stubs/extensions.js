export const extension_settings = {};

export function getContext() {
    if (!globalThis.__nemoOrchestratorTestContext) {
        throw new Error('No SillyTavern test context was configured.');
    }
    return globalThis.__nemoOrchestratorTestContext;
}
