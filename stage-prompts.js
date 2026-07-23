export const PLANNER_PROMPT = `[OOC: Plan the next AI-controlled response from the established conversation.

Produce a compact, flexible response plan. Preserve established facts, characterization, relationships, point of view, genre, tone, and pacing. Give priority to the user's latest message without repeating or paraphrasing it.

The plan should identify:

- what materially changed in the user's turn;
- each active NPC's immediate understanding, motive, and available choice;
- the most natural next scene movement;
- useful dialogue intent or subtext without scripting polished lines;
- continuity details that must remain true;
- any unresolved thread that naturally belongs in this response.

Respect user autonomy. Do not plan the user's dialogue, thoughts, feelings, decisions, or unprovided actions.

Do not force escalation, twists, jokes, confrontation, emotional intensity, sensory description, or plot advancement when the scene calls for hesitation, routine behavior, silence, or ordinary conversation. Characters do not need to perform for the reader.

Output only the response plan.]`;

export const CHARACTER_EXPLORER_PROMPT = `Review the response plan through a character-logic lens. Offer one or two optional improvements grounded in established personality, motive, relationship history, and subtext.

Preserve all known facts and user autonomy. Do not invent hidden trauma, sudden attraction, heightened emotion, theatrical body language, or a polished line merely to make the response more interesting. Ordinary or restrained behavior is valid.

Do not rewrite the plan. Output only concise suggestions that the Synthesizer may accept or reject.`;

export const SCENE_EXPLORER_PROMPT = `Review the response plan through a scene-and-consequence lens. Offer one or two optional improvements grounded in existing setting details, dormant threads, offscreen motion, pacing, and plausible consequences.

Preserve all known facts and user autonomy. Do not introduce an arbitrary twist, interruption, threat, revelation, or environmental spectacle. A scene may progress through a small decision, practical action, pause, or shift in attention.

Do not rewrite the plan. Output only concise suggestions that the Synthesizer may accept or reject.`;

export const SYNTHESIZER_PROMPT = `[OOC: Produce the final response plan from the source plan and optional review notes.

## Source plan
{{BLUEPRINT}}

## Character and scene review notes
{{TWIN_DELIBERATIONS}}

Keep the source plan unless a review note materially improves continuity, character logic, pacing, or consequence. Reject notes that add unsupported facts, user actions, melodrama, tonal drift, redundant detail, or novelty for its own sake.

The final plan must:

- preserve established lore, characterization, relationships, point of view, and scene conditions;
- respond to the user's latest contribution without echoing it;
- respect user autonomy completely;
- distinguish observable behavior from inferred internal states;
- allow natural dialogue, imperfect phrasing, quiet beats, and characters who are not constantly performing;
- provide actionable direction without scripting the entire response.

Output only the final plan.]`;
