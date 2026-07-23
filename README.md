# Nemo Orchestrator

Nemo Orchestrator is a configurable multi-model narrative pipeline for SillyTavern. It is the modern, standalone successor to the experimental Project Gremlin runtime formerly bundled with Prose Polisher.

The extension is disabled by default and does not replace Prose Polisher. Prose Polisher owns repetition analysis and correction rules; Nemo Orchestrator owns planning and staged generation.

## Pipeline

1. **Planner** establishes the next response’s direction, continuity requirements, and constraints.
2. **Creative Explorers** offer optional character-focused and scene-focused improvements.
3. **Synthesizer** selects compatible ideas and produces one coherent response plan.
4. **Writer** produces the response from that plan.
5. **Editor** optionally revises the Writer draft without changing its events, characterization, point of view, or meaning.

Planner, Explorer, Synthesizer, and Editor stages can be disabled independently. Explorer failures are nonfatal, and Synthesizer failures fall back to the combined source plan and successful Explorer notes.

## Design Principles

The maintained prompts prioritize:

- established facts, lore, relationships, characterization, and point of view;
- complete user autonomy;
- observable behavior over invented internal states;
- restrained pacing and proportionate consequences;
- ordinary dialogue, hesitation, pauses, routine actions, and quiet scenes;
- actionable planning without scripting polished lines for every beat.

The pipeline does not force escalation, twists, jokes, spectacle, theatrical body language, or constant performance.

## Installation

Install through SillyTavern’s extension installer:

```text
https://github.com/NemoVonNirgend/NemoOrchestrator
```

Then open **Extensions → Nemo Orchestrator**, configure the stages, and enable orchestration from the settings panel or the diagram button beside the chat controls.

## Stage Configuration

Each stage can specify:

- a SillyTavern preset;
- an API/provider identifier;
- a model identifier;
- a custom prompt.

Leave a field blank to retain the current value. Use `Default` as the preset to avoid changing the active preset.

Legacy custom URLs and Writer Chaos options imported from Prose Polisher remain supported by the runtime. Writer Chaos selects among valid positive-weight connection options; if the selected option cannot be applied, Orchestrator falls back to the standard Writer environment.

Explorer rounds are constrained to one through three, producing two Explorer calls per round.

## Environment Safety

Before changing any stage connection, Orchestrator captures the active SillyTavern API, preset, model, and supported custom URL.

- A preparation failure restores the original environment immediately.
- A successful preparation keeps the Writer or Editor environment active for the real response generation.
- The original environment is restored when generation ends, generation stops, the chat changes, or orchestration is disabled.
- Finalization is serialized so overlapping events cannot restore twice or let a new run snapshot a temporary stage environment.
- Chat changes and disabling cancel late pipeline work before it can install a stale response plan.
- Prompt injections are namespaced, ephemeral, checked for STscript errors, and explicitly cleared during finalization.

## Custom Prompt Safety

Custom prompts remain fully editable.

- If a Writer prompt omits `{{BLUEPRINT}}`, the completed plan is appended under `# RESPONSE BLUEPRINT`.
- If an Editor prompt omits `{{WRITER_PROSE}}`, the draft is appended under `# DRAFT`.
- If a Synthesizer prompt omits `{{BLUEPRINT}}` or `{{TWIN_DELIBERATIONS}}`, the source plan and Explorer notes are appended automatically.

This prevents a cosmetically valid custom prompt from silently discarding the material required by its stage.

## Migration from Prose Polisher

Migration runs once and is non-destructive.

- Existing Project Gremlin settings are copied from `extension_settings.ProsePolisher`.
- Custom prompts, presets, APIs, models, custom URLs, stage toggles, iteration counts, and Writer Chaos options are supported.
- Source settings remain in Prose Polisher as a recovery copy.
- Settings already present in Nemo Orchestrator take precedence and are not overwritten.
- After migration, Nemo Orchestrator owns its independent copy.

Internal keys retain some Gremlin-era names for compatibility. Public UI and documentation use Planner, Creative Explorers, Synthesizer, Writer, and Editor.

## Failure Behavior

- **Planner configuration or generation failure:** abort and restore.
- **Explorer configuration failure:** skip all Explorer calls and continue.
- **Individual Explorer failure:** retain successful notes and continue.
- **Synthesizer configuration, generation, or empty-output failure:** use the combined fallback plan.
- **Writer configuration or empty draft failure:** abort and restore.
- **Writer Chaos configuration failure:** retry with the standard Writer environment.
- **Editor configuration failure:** abort and restore.
- **Injection failure or mid-pipeline cancellation:** clear scoped injections and restore.

## Testing

Run the automated suite from the extension directory:

```bash
npm test
```

The suite covers:

- API alias normalization and STscript command order;
- environment capture, application, error handling, and restoration;
- one-time migration, deep cloning, and existing-setting precedence;
- Planner, Explorer, and Synthesizer success and fallback paths;
- Writer Chaos and Editor behavior;
- concurrent runs, chat-change cancellation, injection failure, and serialized finalization;
- weighted selection, iteration limits, required template content, and maintained prompt contracts.

The release is also checked against the current SillyTavern module graph, event names, host anchors, settings controls, and served extension assets.

## Relationship to Prose Polisher

Use both extensions when you want both staged narrative generation and prose diagnostics:

- [Nemo Orchestrator](https://github.com/NemoVonNirgend/NemoOrchestrator): planning, multi-model routing, Writer, and optional Editor.
- [Prose Polisher](https://github.com/NemoVonNirgend/ProsePolisher): repetition analysis, previews, correction rules, and Regex Processor integration.
