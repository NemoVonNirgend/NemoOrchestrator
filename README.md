# Nemo Orchestrator

Nemo Orchestrator is a configurable multi-model narrative pipeline for SillyTavern. It extracts and modernizes the experimental Project Gremlin system that was previously bundled inside Prose Polisher.

## Pipeline

1. **Planner** establishes the next response’s direction, continuity requirements, and constraints.
2. **Creative Explorers** independently propose character-focused and plot-focused possibilities.
3. **Synthesizer** selects compatible ideas and turns them into one actionable response plan.
4. **Writer** produces the response.
5. **Editor** optionally revises the draft without changing its events or characterization.

Every stage can use the current SillyTavern connection or switch to its own preset, API, and model through STscript commands.

## Status

The `0.1.x` series is an extraction and compatibility release. Internal setting names retain some Project Gremlin terminology so existing configurations can be migrated safely. Public UI terminology uses the new stage names.

On first load, Nemo Orchestrator copies any existing Project Gremlin stage configuration from `extension_settings.ProsePolisher`. This includes custom prompts, presets, APIs, models, enabled stages, iteration counts, and Writer Chaos options. The source settings are not deleted, and the imported copy is subsequently owned by Nemo Orchestrator.

## Installation

Install through SillyTavern’s extension installer:

```text
https://github.com/NemoVonNirgend/NemoOrchestrator
```

The extension is disabled by default. Configure the stages in Extensions → Nemo Orchestrator, then enable it from the settings panel or the diagram button beside the chat controls.

## Relationship to Prose Polisher

Nemo Orchestrator owns narrative planning and multi-model generation. Prose Polisher remains focused on repetition analysis, diagnostics, correction rules, and targeted prose revision.
