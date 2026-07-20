/** sourceFromUrl — derive media provider name from URL host for attribution */

export function sourceFromUrl(url: string): string {
    let host = '';
    try {
        host = new URL(url).hostname;
    } catch {
        return 'unknown';
    }
    if (host.includes('pexels')) return 'pexels';
    if (host.includes('pixabay')) return 'pixabay';
    if (host.includes('wikimedia') || host.includes('commons')) return 'wikimedia';
    if (host.includes('archive.org')) return 'internet-archive';
    if (host.includes('openverse')) return 'openverse';
    return host || 'unknown';
}
