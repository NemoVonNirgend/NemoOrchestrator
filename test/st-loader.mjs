const EXTENSIONS_STUB = new URL('./stubs/extensions.js', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
    if (specifier === '../../../extensions.js') {
        return {
            url: EXTENSIONS_STUB,
            shortCircuit: true,
        };
    }
    return nextResolve(specifier, context);
}
