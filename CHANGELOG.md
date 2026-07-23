# Changelog

## 0.2.0

### Added

- Optional Fine Control mode with a full-screen visual workflow canvas.
- Draggable Generation, Join, and Output nodes with visible input/output ports.
- Click-to-connect branching and reconvergence, including multiple dependency-ready branches.
- Per-node prompts, presets, APIs, models, custom URLs, and failure policies.
- Named input placeholders such as `{{planner}}` and aggregate `{{INPUTS}}` injection.
- Versioned workflow persistence with JSON import, export, and maintained-default reset.
- Graph validation for cycles, duplicate nodes, disconnected branches, missing prompts, and ambiguous outputs.
- Runtime node states for running, completed, and failed stages.
- Canvas zoom, cursor-centered wheel zoom, background panning, fit-to-workflow, and reset-view controls.
- Fifty-step undo/redo history, node duplication, editable workflow names, and keyboard shortcuts.
- Dependency step badges that identify sibling nodes as parallel-ready.
- Context nodes for the latest user message, last assistant message, bounded chat history, character card, and user persona.
- Template nodes that reshape or label connected material without making another model call.
- Condition nodes with green true and red false routes, text comparisons, emptiness checks, and regular-expression matching.
- Inactive-branch propagation so untaken conditional paths are visibly skipped and never spend generation calls.

### Changed

- The existing five-stage configuration remains available as Simple setup and is still the default.
- Fine Control begins with a maintained Planner → parallel Explorers → Join → Synthesizer → Narrator → Editor graph populated from the user's existing connection and prompt settings.
- Workflow execution now uses the same transactional connection capture, cancellation, cleanup, and restoration guarantees as Simple setup.
- Saved version-1 graphs normalize automatically to the version-2 node and edge schema.

### Execution note

- Independent branches are recognized as the same dependency batch. They are currently executed in safe sequence because SillyTavern's active API, preset, model, and custom URL are shared global state. The graph format preserves concurrency boundaries for a future isolated-generation transport.

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
