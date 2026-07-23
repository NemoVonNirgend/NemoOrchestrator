# Changelog

## 0.1.0

### Added

- Standalone Planner, Creative Explorer, Synthesizer, Writer, and optional Editor pipeline.
- Independent preset, API, model, and custom prompt configuration for each stage.
- Modern default prompts centered on continuity, user autonomy, restrained pacing, and non-performative character behavior.
- Non-destructive one-time import of legacy Project Gremlin settings from Prose Polisher.
- Writer Chaos compatibility for migrated weighted connection options.
- Transactional SillyTavern environment capture and restoration.
- Scoped ephemeral plan injections and generation-end cleanup.
- Cancellation handling for chat changes, disabled orchestration, and concurrent preparation.
- Fallback behavior for optional Explorer and Synthesizer failures.
- Required-content protection for custom Synthesizer, Writer, and Editor prompts.
- Automated regression coverage for the pipeline, environment commands, migration, lifecycle, utilities, and prompt contracts.

### Compatibility

- Tested against SillyTavern 1.18 extension paths, event names, host anchors, and STscript command syntax.
- Gremlin-era internal setting keys are retained so existing configurations can migrate without destructive conversion.

### Release Note

- This is the first standalone Nemo Orchestrator release.
- The extension is disabled by default.
- Prose Polisher is optional but required for automatic migration of settings previously saved there.
