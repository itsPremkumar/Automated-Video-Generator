/**
 * net-safety.ts — guards against SSRF / private-metadata access when the
 * pipeline fetches arbitrary upstream URLs (stock-media downloads, user-supplied
 * sources, poisoned cache entries).
 *
 * A "safe" URL is one we are willing to let the server fetch on the user's
 * behalf: http/https only, and the host must NOT be a private/loopback/
 * link-local/cloud-metadata address. This blocks the classic
 * "fetch http://169.254.169.254/latest/meta-data" cloud-credential
 * exfiltration and internal-network probing via a crafted asset URL.
 */
import * as net from 'net';
import * as url from 'url';

// IPv4 ranges that must never be fetched (RFC 1918 + loopback + link-local
// + carrier-grade NAT + metadata 169.254.169.254).
function isPrivateIPv4(ip: string): boolean {
    const p = ip.split('.').map(Number);
    if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return false;
    const [a, b] = p;
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a >= 224) return true; // multicast + reserved
    return false;
}

function isPrivateHostname(host: string): boolean {
    const h = host.toLowerCase().replace(/[[\]]/g, '');
    if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) {
        return true;
    }
    return false;
}

function isPrivateIPv6(host: string): boolean {
    const h = host.toLowerCase().replace(/[[\]]/g, '');
    if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true;
    return false;
}

/**
 * Synchronous, hostname-based safety check. Covers scheme allow-list and
 * private/loopback/link-local hostnames. NOTE: this does NOT do a DNS
 * lookup (sync DNS is unreliable across runtimes); callers that want full
 * IP-resolution protection should additionally validate the resolved IP
 * (e.g. via net.resolve4) before streaming. For the asset-download path
 * the hostname checks below already block the common cloud-metadata and
 * internal-hostname vectors.
 */
export function isSafeUrl(raw: string): { ok: true } | { ok: false; reason: string } {
    let parsed: url.URL;
    try {
        parsed = new url.URL(raw);
    } catch {
        return { ok: false, reason: 'malformed URL' };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { ok: false, reason: `scheme ${parsed.protocol} not allowed (http/https only)` };
    }
    const host = parsed.hostname;
    if (isPrivateHostname(host)) {
        return { ok: false, reason: `host ${host} is private/local` };
    }
    if (isPrivateIPv6(host)) {
        return { ok: false, reason: `host ${host} is loopback/ULA/link-local (IPv6)` };
    }
    // Numeric IPv4 host (URL.hostname can be a bare IP) — check directly.
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) && isPrivateIPv4(host)) {
        return { ok: false, reason: `host ${host} is a private IPv4 address` };
    }
    return { ok: true };
}
