const LEGACY_EXTENSION = 'ProsePolisher';
const MIGRATION_VERSION = 1;

const LEGACY_KEYS = [
    'gremlinPapaEnabled',
    'gremlinTwinsEnabled',
    'gremlinMamaEnabled',
    'gremlinAuditorEnabled',
    'gremlinTwinsIterations',
    'gremlinPapaPreset',
    'gremlinPapaApi',
    'gremlinPapaModel',
    'gremlinPapaSource',
    'gremlinPapaCustomUrl',
    'gremlinPapaInstructions',
    'gremlinTwinsPreset',
    'gremlinTwinsApi',
    'gremlinTwinsModel',
    'gremlinTwinsSource',
    'gremlinTwinsCustomUrl',
    'gremlinTwinsVexInstructionsBase',
    'gremlinTwinsVaxInstructionsBase',
    'gremlinMamaPreset',
    'gremlinMamaApi',
    'gremlinMamaModel',
    'gremlinMamaSource',
    'gremlinMamaCustomUrl',
    'gremlinMamaInstructions',
    'gremlinWriterPreset',
    'gremlinWriterApi',
    'gremlinWriterModel',
    'gremlinWriterSource',
    'gremlinWriterCustomUrl',
    'gremlinWriterInstructionsTemplate',
    'gremlinWriterChaosModeEnabled',
    'gremlinWriterChaosOptions',
    'gremlinAuditorPreset',
    'gremlinAuditorApi',
    'gremlinAuditorModel',
    'gremlinAuditorSource',
    'gremlinAuditorCustomUrl',
    'gremlinAuditorInstructionsTemplate',
];

function cloneSetting(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
}

export function importLegacySettings(
    extensionSettings,
    orchestratorSettings,
    existingKeys = [],
) {
    if (orchestratorSettings.migrationVersion >= MIGRATION_VERSION) {
        return { imported: false, count: 0 };
    }

    const legacy = extensionSettings[LEGACY_EXTENSION];
    const protectedKeys = new Set(existingKeys);
    let count = 0;

    if (legacy && typeof legacy === 'object') {
        for (const key of LEGACY_KEYS) {
            if (legacy[key] === undefined || protectedKeys.has(key)) continue;
            orchestratorSettings[key] = cloneSetting(legacy[key]);
            count += 1;
        }

        if (
            legacy.projectGremlinEnabled !== undefined &&
            !protectedKeys.has('enabled')
        ) {
            orchestratorSettings.enabled = Boolean(legacy.projectGremlinEnabled);
            count += 1;
        }
    }

    orchestratorSettings.migrationVersion = MIGRATION_VERSION;
    orchestratorSettings.migratedFromProsePolisher = count > 0;
    return { imported: count > 0, count };
}
