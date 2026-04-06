export function textResponse(text: string) {
    return {
        content: [{ type: 'text' as const, text }],
    };
}

export function errorResponse(message: string) {
    return {
        content: [{ type: 'text' as const, text: `Error: ${message}` }],
        isError: true,
    };
}
