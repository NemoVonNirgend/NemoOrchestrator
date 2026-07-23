import { getContext } from '../../../extensions.js';

function messageText(message) {
    return String(message?.mes || '').trim();
}

function messageName(message, context) {
    if (message?.name) return String(message.name);
    return message?.is_user ? context.name1 || 'User' : context.name2 || 'Assistant';
}

function latestMessage(context, predicate) {
    const messages = Array.isArray(context.chat) ? context.chat : [];
    return [...messages].reverse().find(message =>
        !message?.is_system && predicate(message) && messageText(message));
}

function formatCharacterCard(context) {
    const character = context.characters?.[context.characterId];
    if (!character) {
        const group = context.groups?.find(candidate =>
            String(candidate?.id) === String(context.groupId));
        if (!group) return '';
        return [
            `Name: ${group.name || 'Current group'}`,
            Array.isArray(group.members) && group.members.length
                ? `Members: ${group.members.join(', ')}`
                : '',
        ].filter(Boolean).join('\n');
    }

    const fields = [
        ['Name', character.name],
        ['Description', character.description],
        ['Personality', character.personality],
        ['Scenario', character.scenario],
        ['Example dialogue', character.mes_example],
        ['System prompt', character.system_prompt],
        ['Post-history instructions', character.post_history_instructions],
    ];
    return fields
        .filter(([, value]) => String(value || '').trim())
        .map(([label, value]) => `## ${label}\n${String(value).trim()}`)
        .join('\n\n');
}

export function resolveWorkflowContext(node, context = getContext()) {
    switch (node?.contextSource) {
        case 'last-assistant': {
            return messageText(latestMessage(context, message => !message.is_user));
        }
        case 'chat-history': {
            const limit = Math.min(
                100,
                Math.max(1, Number.parseInt(node?.messageLimit, 10) || 12),
            );
            return (Array.isArray(context.chat) ? context.chat : [])
                .filter(message => !message?.is_system && messageText(message))
                .slice(-limit)
                .map(message => `## ${messageName(message, context)}\n${messageText(message)}`)
                .join('\n\n');
        }
        case 'character-card':
            return formatCharacterCard(context);
        case 'persona':
            return String(context.powerUserSettings?.persona_description || '').trim();
        case 'latest-user':
        default:
            return messageText(latestMessage(context, message => message.is_user));
    }
}
