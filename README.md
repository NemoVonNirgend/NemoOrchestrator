# Nemo Orchestrator

Nemo Orchestrator is a configurable multi-model narrative pipeline for SillyTavern. It is the modern, standalone successor to the experimental Project Gremlin runtime formerly bundled with Prose Polisher.

The extension is disabled by default and does not replace Prose Polisher. Prose Polisher owns repetition analysis and correction rules; Nemo Orchestrator owns planning and staged generation.

## Two Ways to Build

### Simple setup

Simple setup retains the maintained Planner, Creative Explorers, Synthesizer, Writer, and optional Editor configuration. It is the default and requires no graph editing.

### Fine Control

Fine Control exposes the generation pipeline as a visual node graph inspired by visual game-development tools and ComfyUI.

- Drag nodes around the canvas.
- Pan the background, zoom from 40–160%, or fit the complete graph into view.
- Click an output port and then an input port to draw a connection.
- Branch one result into multiple independent stages.
- Recombine branches with a Join node.
- Pull selected SillyTavern data into the graph with Context nodes.
- Route work through green true and red false Condition branches.
- Reshape connected results with zero-call Template nodes.
- Use undo/redo, duplicate nodes, and rename the complete workflow.
- Configure the prompt and connection environment of each generation stage.
- Choose whether an individual Generation failure aborts the workflow or continues with an empty result.
- Import or export complete workflows as JSON.
- Reset to the maintained default graph without changing Simple setup.

Fine Control is opt-in. The first time it is selected, Orchestrator creates this editable workflow from the user's existing settings:

```text
Planner
├── Character Explorer ─┐
└── Scene Explorer ─────┴─ Explorer Join
Planner ──────────────────┴─ Synthesizer → Narrator → Editor / Final Response
```

## Pipeline

1. **Planner** establishes the next response’s direction, continuity requirements, and constraints.
2. **Creative Explorers** offer optional character-focused and scene-focused improvements.
3. **Synthesizer** selects compatible ideas and produces one coherent response plan.
4. **Writer** produces the response from that plan.
5. **Editor** optionally revises the Writer draft without changing its events, characterization, point of view, or meaning.

Planner, Explorer, Synthesizer, and Editor stages can be disabled independently. Explorer failures are nonfatal, and Synthesizer failures fall back to the combined source plan and successful Explorer notes.

## Fine Control Nodes

### Context

A Context node is a root data source and does not make a model call. It can expose:

- the latest user message;
- the last assistant message;
- the most recent 1–100 non-system chat messages;
- the active character card’s maintained descriptive fields;
- or the active user persona.

Context nodes cannot receive incoming connections. Their output can feed a Template, Condition, Join, Generation, or Output node.

### Generation

A Generation node sends its configured prompt and connected inputs through either an isolated Connection Manager profile or the legacy `/gen` transport.

- `{{INPUTS}}` inserts every connected result with a heading naming its source node.
- `{{node-id}}` inserts the result of one directly connected node.
- If a prompt contains neither form, connected material is appended automatically under `# CONNECTED INPUTS`.

A root Generation node has no incoming connection. Its prompt starts the workflow using the current SillyTavern conversation context.

Generation nodes offer two connection modes:

- **Connection Manager profile:** uses the selected profile’s isolated API, model, preset, URL, credentials, and instruct settings. A per-node maximum output length from 128–32,768 tokens is available.
- **Legacy/global environment:** uses the direct preset, API, model, and custom URL fields retained from the original Orchestrator.

Connection Manager must be enabled and contain at least one supported Chat Completion or Text Completion profile before an isolated profile appears in the selector.

### Template

A Template performs the same `{{INPUTS}}` and `{{node-id}}` substitution as a Generation prompt but returns the rendered text directly. It is useful for reusable headings, intermediate formats, shared instructions, and assembling a payload without paying for another model call.

### Condition

A Condition inspects its connected text and activates either its green **true** connections or red **false** connections. Supported tests include:

- contains or does not contain;
- equals or does not equal;
- matches or does not match a regular expression;
- is empty or is not empty;
- and optional case sensitivity.

Nodes whose only incoming connections belong to an untaken branch are marked skipped. Their descendants remain skipped until a branch reconverges with an active input.

### Join

A Join waits for every connected branch and combines their results with its configurable separator. It makes fan-out/fan-in workflows explicit without spending another model call.

### Output

Every valid workflow contains exactly one Output node. It must be terminal and connected. Orchestrator configures that node's environment and injects its completed prompt for SillyTavern's real response generation.

Use a Generation node immediately before Output when a Narrator should draft prose for an Editor. Connect a planning node directly to Output when the normal SillyTavern generation should act as the Narrator.

## Scheduling and Concurrency

Connections define dependencies. Nodes that become ready together are placed in the same execution batch.

Sibling Generation nodes assigned to Connection Manager profiles execute simultaneously. Their requests use explicit profile settings, so different providers and models can run together without changing SillyTavern’s active global connection.

Legacy/global Generation nodes remain serialized after the isolated group because they still change shared API, preset, model, and custom URL state. This lets old migrated workflows continue to work safely while newer workflows opt into genuine concurrency one node at a time.

The Output node also retains the global environment because it prepares SillyTavern’s visible response generation rather than making an internal raw request.

Stopping generation, changing chats, or disabling Orchestrator aborts active isolated requests. If one required concurrent node fails, Orchestrator waits for its already-running siblings to settle before performing transactional cleanup, preventing late results from mutating a finished workflow.

## Workflow Validation

Orchestrator refuses to run a Fine Control graph that contains:

- no nodes or no Output;
- more than one Output;
- an Output with outgoing connections;
- a cycle;
- duplicate node identifiers;
- a Context node with incoming connections;
- a Condition without an input or branch;
- an invalid Condition regular expression;
- a Join without inputs;
- a non-Join node without a prompt;
- or a branch that never contributes to Output.

The canvas footer reports the first validation issue while editing.

Each node also displays its dependency step. Nodes marked **parallel-ready** have
all become runnable from the same upstream state and do not depend on one another.

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
