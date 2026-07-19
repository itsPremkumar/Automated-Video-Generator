import { Request, RequestHandler } from 'express';
import { ForbiddenError } from '../lib/errors';

function normalizeAddress(address: string | undefined): string {
    return (address || '').replace(/^::ffff:/, '').split('%')[0];
}

function isLoopbackAddress(address: string | undefined): boolean {
    const normalized = normalizeAddress(address);
    return normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost';
}

export function isLocalRequest(req: Request): boolean {
    // SECURITY: ALLOW_UNSAFE_REMOTE_ADMIN is a deliberate escape hatch for
    // trusted LAN/dev use. It must NEVER downgrade write/destructive routes —
    // those stay loopback-only so a remote caller cannot read or write the
    // local filesystem or .env. Only read-only (GET/HEAD) requests are relaxed.
    if (process.env.ALLOW_UNSAFE_REMOTE_ADMIN === '1' && (req.method === 'GET' || req.method === 'HEAD')) {
        return true;
    }

    return isLoopbackAddress(req.ip || req.socket.remoteAddress);
}

export const requireLocalAccess: RequestHandler = (req, _res, next) => {
    if (!isLocalRequest(req)) {
        next(new ForbiddenError('This endpoint is only available from local trusted clients.'));
        return;
    }

    next();
};
