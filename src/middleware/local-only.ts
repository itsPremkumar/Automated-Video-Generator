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
    if (process.env.ALLOW_UNSAFE_REMOTE_ADMIN === '1') {
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
