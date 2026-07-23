export function chooseWeighted(options, random = Math.random) {
    const valid = (Array.isArray(options) ? options : []).filter(option => {
        const weight = Number(option?.weight);
        const hasEnvironment = Boolean(
            option?.api ||
            option?.model ||
            (option?.preset && option.preset !== 'Default'),
        );
        return Number.isFinite(weight) && weight > 0 && hasEnvironment;
    });
    const total = valid.reduce((sum, option) => sum + Number(option.weight), 0);
    if (total <= 0) return null;

    let cursor = Math.min(Math.max(Number(random()), 0), 0.999999999999) * total;
    for (const option of valid) {
        cursor -= Number(option.weight);
        if (cursor < 0) return option;
    }
    return valid.at(-1) ?? null;
}

export function normalizeExplorerIterations(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return 1;
    return Math.min(Math.max(parsed, 1), 3);
}

export function fillTemplate(template, replacements) {
    return Object.entries(replacements).reduce(
        (result, [placeholder, value]) =>
            result.replaceAll(`{{${placeholder}}}`, String(value ?? '')),
        template,
    );
}

export function fillRequiredTemplate(template, placeholder, value, heading) {
    const token = `{{${placeholder}}}`;
    if (template.includes(token)) {
        return template.replaceAll(token, String(value ?? ''));
    }
    return `${template.trim()}\n\n# ${heading}\n${String(value ?? '')}`;
}
