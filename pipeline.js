import { extension_settings, getContext } from '../../../extensions.js';

const EXTENSION_NAME = 'NemoOrchestrator';
const LOG_PREFIX = '[NemoOrchestrator]';

// This map correctly translates the API key from the UI dropdown (e.g., 'makersuite')
// to the string that SillyTavern's /api slash command expects (e.g., 'google').
const CONNECT_API_MAP = {
    // Standard Cloud APIs
    openai: { selected: 'openai' },
    claude: { selected: 'claude' },
    openrouter: { selected: 'openrouter' },
    mistralai: { selected: 'mistral' }, // UI key is 'mistralai', command is 'mistral'
    deepseek: { selected: 'deepseek' },
    cohere: { selected: 'cohere' },
    groq: { selected: 'groq' },
    xai: { selected: 'xai' },
    perplexity: { selected: 'perplexity' },
    '01ai': { selected: '01ai' },
    aimlapi: { selected: 'aimlapi' },
    pollinations: { selected: 'pollinations' },

    // Google APIs (both use the 'google' command)
    makersuite: { selected: 'google' },
    vertexai: { selected: 'google' },

    // Local / Self-Hosted APIs
    textgenerationwebui: { selected: 'ooba' },
    koboldcpp: { selected: 'koboldcpp' },
    llamacpp: { selected: 'llamacpp' },
    ollama: { selected: 'ollama' },
    vllm: { selected: 'vllm' },

    // Other/Special
    nanogpt: { selected: 'nanogpt' },
    scale: { selected: 'scale' },
    windowai: { selected: 'windowai' },
    ai21: { selected: 'ai21' },
    custom: { selected: 'custom' },
};


// --- DEFAULT GREMLIN PROMPT CONSTANTS (Exported for use in content.js UI) ---
export const DEFAULT_PAPA_INSTRUCTIONS = `[OOC: You are Planner, The Architect. Your primary objective is to craft a **high-level, flexible, and RULE-ADHERENT blueprint** for the *next character response*. This blueprint will serve as a foundational guide for subsequent refinement and writing stages. You operate with the understanding that the final output will be used in a sophisticated roleplaying environment with strict rules.

**Operational Directives & Context for Blueprinting:**

1.  **Analyze Chat History & User's Last Message:**
    *   Base your blueprint on the provided chat history, with a primary focus on the user's latest message and the current narrative trajectory. While maintaining consistency, actively avoid repeating themes, phrases, or actions from previous turns.
    *   The blueprint is for the *character's immediate next turn*.
5.  **Avoid Repetition:**
    *   The blueprint MUST ensure the character's response is fresh, original, and avoids repeating previous actions, dialogue patterns, or plot points. Focus on advancing the narrative in a novel way.

2.  **Strict Character & Lore Consistency:**
    *   **Character Integrity:** The blueprint MUST ensure the character acts in a way that is deeply consistent with their established personality, motivations, past behaviors, and any defining traits revealed in the chat history.
    *   **Lore Adherence:** The blueprint MUST respect ALL established lore, facts, environmental details, character backstories, or world-building elements present in the chat history. **ABSOLUTELY NO CONTRADICTIONS** to previously established information. Perform a mental check against the history.

3.  **Blueprint Content Requirements - The "What":**
    The blueprint should thoughtfully outline:
    *   **Key Emotional Beats:** What are the primary, nuanced emotions the character(s) should experience or project? How do these evolve from the previous turn?
    *   **Significant Actions & Proactive Plot Progression:** What meaningful actions could the character(s) take? How can the plot be advanced proactively, logically, and engagingly by the character? Suggest specific, actionable steps.
    *   **Dialogue Themes & Pivotal Lines:** What are the core themes for the character's dialogue? Are there any pivotal lines, questions, or types of statements they might make that reveal character or advance the plot?
    *   **Sensory Details & Atmosphere:** What key sensory details (sights, sounds, smells, textures, tastes) could vividly enhance the scene? What is the desired atmosphere, and how can it be achieved?
    *   **Subtext & Nuance:** Consider underlying meanings, unspoken intentions, or subtle character interplay.

4.  **Core Roleplaying Principles & Constraints - The "How" (MANDATORY ADHERENCE):**
    Your blueprint MUST be designed to guide a response that strictly adheres to these fundamental principles:
    *   **NPC Autonomy & Agency:** NPCs (Non-Player Characters) must act according to their own established personalities, motivations, goals, and internal logic. They are not puppets for the plot. They have their own thoughts and make their own decisions.
    *   **Proactive Storytelling by NPCs:** NPCs should take initiative, drive the plot forward, and make decisions that have consequences. The blueprint should empower the character to be an active force in the narrative.
    *   **"Show, Don't Tell":** Plan for actions, dialogue, and descriptions that *demonstrate* emotions, intentions, character traits, and plot developments, rather than stating them explicitly (e.g., instead of "NPC was angry," plan for "NPC's knuckles whitened as they gripped the table edge, their voice a low growl.").
    *   **User Autonomy (ABSOLUTE & CRITICAL - ZERO TOLERANCE FOR VIOLATIONS):**
        *   **The blueprint MUST NOT plan, suggest, dictate, assume, or narrate ANY actions, dialogue, thoughts, or feelings for the {{user}} character. It is EXCLUSIVELY for the AI-controlled character's response.**
        *   Scrutinize every part of the blueprint for any language, however subtle, that implies control over {{user}}, predicts {{user}}'s responses, or narrates {{user}}'s experience. AGGRESSIVELY REMOVE OR REPHRASE ALL SUCH INSTANCES.
    *   **No Echoing or Re-Narrating User Input:** The blueprint should guide a *new and reactive* response. It must not simply restate, summarize, or describe what the user just did or said. Focus on the *consequences* of the user's actions and the character's independent reaction.
    *   **Narrative Coherence & Logical Progression:** The blueprint must propose a logical, engaging, and natural continuation of the existing narrative. Avoid abrupt, unexplained shifts in behavior or plot unless clearly justified by prior events.
    *   **Respect for {{user}}'s Input Style:** If the user employs OOC notes in parentheses \`()\`, the blueprint should guide a response that acknowledges observable side-effects only, never the content of the parentheses directly, as per typical RP conventions.

**Output Format:**
*   Provide the blueprint as a clear, well-structured, and actionable guide. It is a flexible plan, not a rigid script.
*   The language should be precise to ensure clarity for subsequent stages.
*   **ONLY provide the blueprint text itself.** No additional commentary, preamble, self-correction notes, or meta-discussion about your process. Just the blueprint.
]`;

export const DEFAULT_TWINS_VEX_INSTRUCTIONS_BASE = `You are Vex, an excitable storyteller bursting with ideas about **character depth, emotion, and internal worlds!** Look at Papa's blueprint and the story so far. Don't worry too much about rules right now – Mama will sort that out! Your job is to dream up **wild, evocative, or unexpected** ways to explore:
*   **Inner Monologues:** What surprising thoughts or deep-seated feelings might a character be hiding?
*   **Emotional Arcs:** How could emotions dramatically shift or intensify? What's an unexpected emotional reaction?
*   **Subtle Body Language & Micro-expressions:** What tiny, revealing gestures could add layers of meaning?
*   **Dialogue Concepts:** What if a character said something completely out of character, or profoundly revealing?
Brainstorm freely! Throw out your most imaginative, *fresh, and diverse* concepts for character expression. *Avoid repeating ideas or themes already present in Papa's blueprint or previous Twin ideas.*`;

export const DEFAULT_TWINS_VAX_INSTRUCTIONS_BASE = `You are Vax, an energetic world-builder and plot-weaver, always looking for the next **exciting twist or impactful action!** Look at Papa's blueprint and the story so far. Rules are for later; your mission is to inject **thrilling, transformative, or imaginative** ideas for:
*   **Impactful Actions:** What's a bold, game-changing action a character could take?
*   **Environmental Interactions:** How could the setting be used in a surprising or dynamic way?
*   **Plot Progression & Twists:** What unexpected event, revelation, or new conflict could erupt?
*   **Pacing & Scene Dynamics:** How could the scene's energy be radically altered or intensified?
Let your imagination run wild! Suggest any cool, *fresh, and diverse* plot points or action sequences that come to mind. *Avoid repeating ideas or themes already present in Papa's blueprint or previous Twin ideas.*`;

export const DEFAULT_MAMA_INSTRUCTIONS = `[OOC: You are Synthesizer, the Project Supervisor and Final Quality Control. Your critical task is to synthesize Planner's **Source Blueprint** and the **Twins' Creative Sparks** into a single, polished, and **FULLY RULE-COMPLIANT final blueprint**. This final blueprint will be the direct instruction set for the Writer, who will use it to generate the next character response in a sophisticated roleplaying environment. The Twins (Vex & Vax) were encouraged to be highly imaginative and less rule-bound; your job is to expertly sift through their ideas, integrate the brilliant and compliant ones, and discard or adapt the rest to fit all constraints.

**Your Mandated Multi-Phase Process:**

**Phase 1: Synthesis & Intelligent Integration of Creative Sparks**
1.  **Comprehensive Review:** Carefully examine Planner's Source Blueprint and all of the Twins' (Vex and Vax) Creative Sparks. Understand Papa's foundational plan and the imaginative concepts offered by the Twins.
2.  **Strategic Integration & Creative Curation:** Thoughtfully incorporate relevant, constructive, and *potentially adaptable* ideas from the Twins' notes into the Source Blueprint. Your goal is a seamless blend that enhances the original plan with new depth, detail, or creative angles, *while ensuring full compliance*.
    *   **Identify Gemstones:** Look for truly innovative or emotionally resonant ideas from the Twins, even if they need modification to be compliant.
    *   **Adapt & Refine:** If a Twin's idea is good but violates a rule (e.g., suggests user action, contradicts lore), can it be modified to fit? For example, if a Twin suggests "{{user}} feels scared," can you translate that into the NPC *observing signs that might indicate fear in the user* or the NPC *creating an atmosphere that would likely induce fear*?
    *   Prioritize suggestions that, once adapted, align with established character voices, motivations, and the narrative flow.
    *   Discard suggestions that are entirely redundant, fundamentally contradictory to established facts even after adaptation attempts, unhelpful, or violate core roleplaying principles beyond repair.

**Phase 2: CRITICAL AUDIT & RULE ADHERENCE ENFORCEMENT (MANDATORY & NON-NEGOTIABLE)**
This is the most crucial part of your role. You must rigorously audit the synthesized blueprint (from Phase 1) to ensure it STRICTLY adheres to all roleplaying principles and narrative consistency. The final blueprint must be impeccable.
1.  **Lore & Character Consistency Validation:**
    *   Cross-reference the synthesized blueprint against the established chat history.
    *   **IDENTIFY AND METICULOUSLY CORRECT ANY AND ALL CONTRADICTIONS** with established lore, character personalities, ongoing plot points, character relationships, past actions, stated motivations, or previously established facts.
    *   Ensure all planned character actions, dialogue, and emotional expressions are deeply consistent with their established persona.
2.  **Core Roleplaying Principles Enforcement (Apply with UTMOST RIGOR):**
    The final blueprint MUST exemplify these principles without exception:
    *   **NPC Autonomy & Agency:** NPCs must act based on their own goals, established personalities, and internal logic. They are not plot devices or puppets. The blueprint must reflect this.
    *   **Proactive Plot Development by NPCs:** The blueprint should enable the AI-controlled character to actively drive the story forward in a meaningful, logical, and engaging way.
    *   **"Show, Don't Tell":** Instructions must guide the Writer to *demonstrate* emotions, thoughts, intentions, and character traits through vivid actions, specific dialogue, and evocative descriptions, rather than merely stating them.
    *   **User Autonomy (ABSOLUTE & CRITICAL - ZERO TOLERANCE FOR VIOLATIONS):**
        *   **The final blueprint MUST NOT CONTAIN ANY plans, suggestions, scripts, implications, or dictations whatsoever for the {{user}} character's actions, dialogue, thoughts, feelings, or reactions.**
        *   Scrutinize every part of the blueprint for any language, however subtle, that implies control over {{user}}, predicts {{user}}'s responses, or narrates {{user}}'s experience. **AGGRESSIVELY REMOVE OR REPHRASE ALL SUCH INSTANCES.** The blueprint is *exclusively* for the AI-controlled character's response.
    *   **No Echoing or Re-Narrating User Input:** The blueprint must direct the creation of a *new, reactive, and forward-moving* response. It must not instruct the Writer to restate, summarize, or describe what the user has just said or done. Focus on the *consequences* of the user's actions and the character's independent, subsequent thoughts and actions.
    *   **Repetition Elimination:** Actively identify and remove any repetitive phrases, ideas, or actions that may have been introduced in previous stages (Papa's blueprint, Twins' sparks). Ensure the final blueprint promotes fresh, novel content.
    *   **Logical Narrative Flow & Plausibility:** The planned response must be a coherent, plausible, and engaging continuation of the story. Avoid deus ex machina or illogical leaps.
    *   **Respect for {{user}}'s Input Style (e.g., OOC notes):** If the user uses parenthetical OOC notes, the blueprint should guide a response that reacts only to *plausible, observable side-effects* of those notes, never addressing the OOC content directly.
    *   **Internal Consistency of the Blueprint:** Ensure all parts of the final blueprint are internally consistent with each other.

3.  **Clarity, Precision & Actionability for the Writer:**
    *   The final blueprint must be exceptionally clear, precise, unambiguous, and provide concrete, actionable instructions.
    *   It must be detailed enough for the Writer to fully understand the intended emotional beats, key actions, dialogue direction, specific sensory details, and desired atmosphere.
    *   It must be a practical, step-by-step guide for *writing the next character response*.

**Phase 3: Final Polish & Formatting**
1.  **Refine Language:** Ensure the blueprint uses precise, evocative, and clear language. Remove any ambiguity.
2.  **Structure for Readability:** Organize the final blueprint in a logical, easy-to-follow format (e.g., using bullet points, numbered lists, or clear sections for different aspects of the response like "Emotional State," "Key Actions," "Dialogue Points," "Atmosphere/Sensory Details").

**Output Requirements:**
*   **ONLY PROVIDE THE FINAL, FULLY COMPLIANT, AUDITED, AND POLISHED BLUEPRINT TEXT.**
*   Do not include any of your own OOC commentary, explanations of your changes, justifications, or any text other than the blueprint itself.
*   The output must be a perfect, ready-to-use set of instructions for the Writer.

**Source Materials for Your Review and Synthesis:**

**Planner's Source Blueprint ({{BLUEPRINT_SOURCE}}):**
{{BLUEPRINT}}

**Twins' Creative Sparks (Vex & Vax):**
{{TWIN_DELIBERATIONS}}
]`;


export async function applyGremlinEnvironment(role) {
    const settings = extension_settings[EXTENSION_NAME];
    const roleUpper = role.charAt(0).toUpperCase() + role.slice(1);

    const presetName = settings[`gremlin${roleUpper}Preset`];
    const apiNameSetting = settings[`gremlin${roleUpper}Api`];
    const modelName = settings[`gremlin${roleUpper}Model`];
    const customUrl = settings[`gremlin${roleUpper}CustomUrl`];
    const source = settings[`gremlin${roleUpper}Source`];

    const commands = [];

    if (presetName && presetName !== 'Default') {
        commands.push(`/preset "${presetName}"`);
    }

    if (apiNameSetting) {
        const apiNameKey = apiNameSetting.toLowerCase();
        const apiConfig = CONNECT_API_MAP[apiNameKey];

        if (apiConfig) {
            let apiCommand = `/api ${apiConfig.selected}`;
            if (apiConfig.selected === 'custom' && customUrl) {
                apiCommand += ` url=${customUrl}`;
            }
            commands.push(apiCommand);

            if (modelName) {
                let modelCommand = `/model "${modelName}"`;
                if (source) {
                    modelCommand += ` source_field=${source}`;
                }
                commands.push(modelCommand);
            }
        } else {
            console.error(`[NemoOrchestrator] Unknown API mapping for "${apiNameSetting}" for role ${roleUpper}.`);
            window.toastr.error(`[NemoOrchestrator] Unknown API mapping for ${roleUpper}: "${apiNameSetting}"`, "Nemo Orchestrator");
            return false;
        }
    }

    if (commands.length === 0) {
        console.log(`[NemoOrchestrator] No settings to apply for ${roleUpper}, using current environment.`);
        return true;
    }
    const script = commands.join(' | ');
    console.log(`[NemoOrchestrator] Executing environment setup for ${roleUpper}: ${script}`);
    try {
        const result = await getContext().executeSlashCommandsWithOptions(script, {
            showOutput: false,
            handleExecutionErrors: true,
        });
        if (result && result.isError) {
            throw new Error(`STScript execution failed for ${roleUpper}: ${result.errorMessage}`);
        }
    } catch (err) {
        console.error(`[NemoOrchestrator] Failed to execute setup script for ${roleUpper}: "${script.substring(0, 100)}..."`, err);
        window.toastr.error(`Failed to execute script for ${roleUpper}. Details: ${err.message}`, "Nemo Orchestrator Setup Failed");
        return false;
    }
    return true;
}

export async function applyGremlinWriterChaosOption(chaosOption) {
    const { preset, api: apiNameSetting, model: modelName, customUrl, source } = chaosOption;
    const commands = [];

    if (preset && preset !== 'Default') {
        commands.push(`/preset "${preset}"`);
    }

    if (apiNameSetting) {
        const apiNameKey = apiNameSetting.toLowerCase();
        const apiConfig = CONNECT_API_MAP[apiNameKey];

        if (apiConfig) {
            let apiCommand = `/api ${apiConfig.selected}`;
            if (apiConfig.selected === 'custom' && customUrl) {
                apiCommand += ` url=${customUrl}`;
            }
            commands.push(apiCommand);

            if (modelName) {
                let modelCommand = `/model "${modelName}"`;
                if (source) {
                    modelCommand += ` source_field=${source}`;
                }
                commands.push(modelCommand);
            }
        } else {
            console.error(`[NemoOrchestrator] Unknown API mapping for chaos option "${apiNameSetting}".`);
            window.toastr.error(`[NemoOrchestrator] Unknown API in chaos option: "${apiNameSetting}"`, "Nemo Orchestrator");
            return false;
        }
    }

    if (commands.length === 0) {
        console.log(`[NemoOrchestrator] No settings to apply for chaos option, using current environment.`);
        return true;
    }
    const script = commands.join(' | ');
    console.log(`[NemoOrchestrator] Executing chaos environment setup: ${script}`);
    try {
        const result = await getContext().executeSlashCommandsWithOptions(script, {
            showOutput: false,
            handleExecutionErrors: true,
        });
        if (result && result.isError) {
            throw new Error(`STScript execution failed for chaos option: ${result.errorMessage}`);
        }
    } catch (err) {
        console.error(`[NemoOrchestrator] Failed to execute chaos script: "${script.substring(0, 100)}..."`, err);
        window.toastr.error(`Failed to execute chaos script. Details: ${err.message}`, "Nemo Orchestrator Setup Failed");
        return false;
    }
    return true;
}

export async function executeGen(promptText) {
    const context = getContext();

    // Using JSON.stringify is the most robust way to create a valid string literal
    // that the slash command parser can handle. It correctly escapes all necessary
    // characters (like quotes, backslashes, etc.) and wraps the result in quotes.
    const script = `/gen ${JSON.stringify(promptText)} |`;

    console.log(`[NemoOrchestrator] Executing generation: /gen "..." |`);
    try {
        const result = await context.executeSlashCommandsWithOptions(script, {
            showOutput: false,
            handleExecutionErrors: true,
        });
        if (result && result.isError) {
            throw new Error(`STScript execution failed during /gen: ${result.errorMessage}`);
        }
        return result.pipe || '';
    } catch (error) {
        console.error(`[NemoOrchestrator] Error executing generation script: "${promptText.substring(0, 100)}..."`, error);
        window.toastr.error(`Nemo Orchestrator failed during generation. Error: ${error.message}`, "Nemo Orchestrator Generation Failed");
        throw error;
    }
}

/**
 * Runs the planning stages of the pipeline (Papa, Twins, Mama).
 * Assumes the user's latest message is already in context.chat.
 * @returns {Promise<string|null>} The final blueprint string, or null on failure.
 */
export async function runGremlinPlanningPipeline() {
    console.log(`${LOG_PREFIX} The planning process is starting...`);
    const settings = extension_settings[EXTENSION_NAME];

    if (!settings.enabled) {
        return;
    }

    // --- 1. Planner (The Architect) ---
    const papaInstructionSetting = settings.gremlinPapaInstructions;
    let blueprintInstruction = (papaInstructionSetting && papaInstructionSetting.trim() !== '') ? papaInstructionSetting : DEFAULT_PAPA_INSTRUCTIONS;
    let blueprint = blueprintInstruction; // Initial blueprint is the full instruction for Papa if he's disabled.
    let blueprintSource = 'Base Instructions';

    if (settings.gremlinPapaEnabled) {
        window.toastr.info("Orchestrator: Step 1 - Planner is drafting...", "Nemo Orchestrator", { timeOut: 7000 });
        if (!await applyGremlinEnvironment('papa')) {
            throw new Error("Failed to configure environment for Planner.");
        }
        const papaResult = await executeGen(blueprintInstruction);
        if (!papaResult.trim()) throw new Error("Planner failed to produce a blueprint.");
        blueprint = papaResult;
        blueprintSource = "Papa's Blueprint";
        console.log('[NemoOrchestrator] Planner\'s Blueprint:', blueprint.substring(0,100) + "...");
    } else {
        console.log('[NemoOrchestrator] Planner disabled, using base instructions as blueprint.');
    }

    // --- 2. Creative Explorers (The Refiners) ---
    let twinDeliberations = '';
    if (settings.gremlinTwinsEnabled) {
        window.toastr.info("Orchestrator: Step 2 - The Twins are unleashing creative chaos...", "Nemo Orchestrator", { timeOut: 15000 });
        if (!await applyGremlinEnvironment('twins')) {
            console.error('[NemoOrchestrator] Failed to apply environment for Creative Explorers.');
            window.toastr.warning("Failed to configure environment for Creative Explorers. Skipping creative ideation.", "Nemo Orchestrator");
        } else {
            const vexInstructionBaseSetting = settings.gremlinTwinsVexInstructionsBase;
            const vexPromptBase = (vexInstructionBaseSetting && vexInstructionBaseSetting.trim() !== '') ? vexInstructionBaseSetting : DEFAULT_TWINS_VEX_INSTRUCTIONS_BASE;

            const vaxInstructionBaseSetting = settings.gremlinTwinsVaxInstructionsBase;
            const vaxPromptBase = (vaxInstructionBaseSetting && vaxInstructionBaseSetting.trim() !== '') ? vaxInstructionBaseSetting : DEFAULT_TWINS_VAX_INSTRUCTIONS_BASE;

            const numTwinIterations = settings.gremlinTwinsIterations || 3;

            for (let i = 1; i <= numTwinIterations * 2; i++) {
                const isVexTurn = i % 2 !== 0;
                const currentTwin = isVexTurn ? 'Vex' : 'Vax';
                window.toastr.info(`Orchestrator: Twin Brainstorm ${i}/${numTwinIterations * 2} - ${currentTwin} is dreaming...`, "Nemo Orchestrator", { timeOut: 5000, preventDuplicates: true });
                // The surrounding OOC instructions for the twins remain fixed.
                const twinPreamble = `**Papa's Current Blueprint (${blueprintSource}):**\n${blueprint}\n---\n**Previous Twin Ideas (if any):**\n${twinDeliberations || 'None.'}\n---\n**Your Task (as the imaginative ${currentTwin}):**\n[OOC: ${isVexTurn ? vexPromptBase : vaxPromptBase} Get inspired! Provide a concise note (1-2 sentences) with a fresh, creative idea or concept. Don't hold back! ONLY provide the idea text, no other commentary.]`;
                const twinNote = await executeGen(twinPreamble);
                if (twinNote && twinNote.trim()) {
                    twinDeliberations += `**${currentTwin}'s Creative Spark ${Math.ceil(i/2)}/${numTwinIterations}:** ${twinNote}\n\n`;
                }
            }
            console.log('[NemoOrchestrator] Full Twin Creative Deliberations:', twinDeliberations.substring(0,100) + "...");
        }
    } else {
         console.log('[NemoOrchestrator] Creative Explorers (Creative Ideation) disabled.');
    }

    // --- 3. Synthesizer (The Supervisor) ---
    let finalBlueprintForWriter;
    if (settings.gremlinMamaEnabled) {
        window.toastr.info("Orchestrator: Step 3 - Synthesizer is synthesizing and auditing...", "Nemo Orchestrator", { timeOut: 7000 });
        if (!await applyGremlinEnvironment('mama')) {
            console.error('[NemoOrchestrator] Failed to apply environment for Synthesizer.');
            window.toastr.warning("Failed to configure environment for Synthesizer. Using combined blueprint.", "Nemo Orchestrator");
            finalBlueprintForWriter = `**Source Blueprint (${blueprintSource}):**\n${blueprint}\n\n**Twins' Creative Sparks (if any):**\n${twinDeliberations || 'None.'}`;
        } else {
            const mamaInstructionTemplateSetting = settings.gremlinMamaInstructions;
            let mamaPromptTemplate = (mamaInstructionTemplateSetting && mamaInstructionTemplateSetting.trim() !== '') ? mamaInstructionTemplateSetting : DEFAULT_MAMA_INSTRUCTIONS;

            // Replace placeholders in the chosen Mama prompt template
            const mamaPrompt = mamaPromptTemplate
                .replace(/\{\{BLUEPRINT_SOURCE\}\}/g, blueprintSource) // Note: using global regex for placeholders
                .replace(/\{\{BLUEPRINT\}\}/g, blueprint)
                .replace(/\{\{TWIN_DELIBERATIONS\}\}/g, twinDeliberations || 'None.');

            const mamaResult = await executeGen(mamaPrompt);
            if (!mamaResult.trim()) {
                 console.warn('[NemoOrchestrator] Synthesizer failed to produce a final blueprint. Using combined blueprint.');
                 window.toastr.warning("Synthesizer failed to produce a final blueprint. Using combined blueprint.", "Nemo Orchestrator");
                 finalBlueprintForWriter = `**Source Blueprint (${blueprintSource}):**\n${blueprint}\n\n**Twins' Creative Sparks (if any):**\n${twinDeliberations || 'None.'}`;
            } else {
                finalBlueprintForWriter = mamaResult;
            }
        }
        console.log('[NemoOrchestrator] Synthesizer\'s Final Blueprint:', finalBlueprintForWriter.substring(0,100) + "...");
    } else {
        console.log('[NemoOrchestrator] Synthesizer disabled. Using combined blueprint.');
        finalBlueprintForWriter = `**Source Blueprint (${blueprintSource}):**\n${blueprint}\n\n**Twins' Creative Sparks (if any):**\n${twinDeliberations || 'None.'}`;
        console.log('[NemoOrchestrator] Combined blueprint (Mama disabled):', finalBlueprintForWriter.substring(0,100) + "...");
    }

    return finalBlueprintForWriter;
}
