import { getContext } from '../../../extensions.js';

export function listConnectionProfiles(context = getContext()) {
    try {
        const disabled = context.extensionSettings?.disabledExtensions || [];
        if (disabled.includes('connection-manager')) return [];
        return context.ConnectionManagerRequestService
            .getSupportedProfiles()
            .map(profile => ({
                id: String(profile.id),
                name: String(profile.name || profile.id),
                api: String(profile.api || ''),
                model: String(profile.model || ''),
            }));
    } catch (error) {
        console.warn('[NemoOrchestrator] Could not list Connection Manager profiles.', error);
        return [];
    }
}

export async function executeProfileGeneration({
    profileId,
    prompt,
    maxTokens = 2048,
    signal,
    context = getContext(),
}) {
    const id = String(profileId || '').trim();
    if (!id) throw new Error('A Connection Manager profile is required.');
    const length = Math.min(
        32768,
        Math.max(128, Number.parseInt(maxTokens, 10) || 2048),
    );
    let response;
    try {
        response = await context.ConnectionManagerRequestService.sendRequest(
            id,
            [{ role: 'user', content: String(prompt || '') }],
            length,
            {
                extractData: true,
                includePreset: true,
                includeInstruct: true,
                stream: false,
                signal,
            },
        );
    } catch (error) {
        if (signal?.aborted) {
            const abortError = new Error('Connection Manager generation was cancelled.', {
                cause: error,
            });
            abortError.name = 'AbortError';
            throw abortError;
        }
        throw error;
    }
    const content = String(response?.content || '').trim();
    if (!content) throw new Error('The Connection Manager profile returned no content.');
    return content;
}
