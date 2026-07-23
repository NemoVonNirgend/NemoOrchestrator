import { getContext } from '../../../extensions.js';

const API_ALIASES = {
    openai: 'openai',
    claude: 'claude',
    openrouter: 'openrouter',
    mistralai: 'mistral',
    mistral: 'mistral',
    deepseek: 'deepseek',
    cohere: 'cohere',
    groq: 'groq',
    xai: 'xai',
    perplexity: 'perplexity',
    '01ai': '01ai',
    aimlapi: 'aimlapi',
    pollinations: 'pollinations',
    makersuite: 'google',
    google: 'google',
    vertexai: 'vertexai',
    textgenerationwebui: 'ooba',
    ooba: 'ooba',
    koboldcpp: 'koboldcpp',
    llamacpp: 'llamacpp',
    ollama: 'ollama',
    vllm: 'vllm',
    nanogpt: 'nanogpt',
    scale: 'scale',
    windowai: 'windowai',
    ai21: 'ai21',
    custom: 'custom',
};

function quote(value) {
    return JSON.stringify(String(value));
}

async function execute(script, context = getContext()) {
    const result = await context.executeSlashCommandsWithOptions(script, {
        showOutput: false,
        handleExecutionErrors: true,
    });
    if (result?.isError) {
        throw new Error(result.errorMessage || `STscript failed: ${script.split(' ')[0]}`);
    }
    return String(result?.pipe ?? '').trim();
}

export function normalizeStageEnvironment(configuration = {}) {
    const apiKey = String(configuration.api || '').trim().toLowerCase();
    const api = apiKey ? API_ALIASES[apiKey] : '';
    if (apiKey && !api) {
        throw new Error(`Unknown API mapping: "${configuration.api}"`);
    }

    return {
        api,
        model: String(configuration.model || '').trim(),
        preset: String(configuration.preset || '').trim(),
        customUrl: String(configuration.customUrl || '').trim(),
    };
}

export function buildEnvironmentCommands(configuration = {}) {
    const environment = normalizeStageEnvironment(configuration);
    const commands = [];

    if (environment.customUrl && environment.api === 'custom') {
        commands.push(`/api-url api=custom connect=false quiet=true ${quote(environment.customUrl)}`);
    }
    if (environment.api) {
        commands.push(`/api quiet=true ${quote(environment.api)}`);
    }
    if (environment.preset && environment.preset !== 'Default') {
        commands.push(`/preset ${quote(environment.preset)}`);
    }
    if (environment.model) {
        commands.push(`/model quiet=true ${quote(environment.model)}`);
    }

    return commands;
}

export async function applyEnvironment(configuration, context = getContext()) {
    const commands = buildEnvironmentCommands(configuration);
    for (const command of commands) {
        await execute(`${command} |`, context);
    }
    return commands.length;
}

export async function captureEnvironment(context = getContext()) {
    const api = await execute('/api |', context);
    const preset = await execute('/preset |', context);
    const model = await execute('/model |', context);
    const customUrl = api === 'custom'
        ? await execute('/api-url api=custom |', context)
        : '';

    return { api, preset, model, customUrl };
}

export async function restoreEnvironment(snapshot, context = getContext()) {
    if (!snapshot) return;
    await applyEnvironment(snapshot, context);
    context.reloadGenerationSettings?.();
}
