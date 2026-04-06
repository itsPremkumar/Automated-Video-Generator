import { randomBytes, randomUUID } from 'crypto';
import { RequestHandler, Response } from 'express';
import { appLogger } from '../lib/logger';

function getRemoteAddress(request: { ip?: string; socket?: { remoteAddress?: string | undefined } }): string {
    return request.ip || request.socket?.remoteAddress || 'unknown';
}

export const requestContextMiddleware: RequestHandler = (req, res, next) => {
    const requestId = req.header('x-request-id')?.trim() || randomUUID();
    const cspNonce = randomBytes(16).toString('base64');
    const startedAt = process.hrtime.bigint();
    const logger = appLogger.child({
        requestId,
        method: req.method,
        path: req.originalUrl,
        remoteAddress: getRemoteAddress(req),
    });

    res.locals.requestId = requestId;
    res.locals.cspNonce = cspNonce;
    res.locals.logger = logger;
    res.setHeader('X-Request-Id', requestId);

    logger.info('request.started');

    res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        const context = {
            durationMs: Number(durationMs.toFixed(2)),
            statusCode: res.statusCode,
        };

        if (res.statusCode >= 500) {
            logger.error('request.completed', context);
            return;
        }

        if (res.statusCode >= 400) {
            logger.warn('request.completed', context);
            return;
        }

        logger.info('request.completed', context);
    });

    next();
};

export function getRequestLogger(res: Response) {
    return res.locals.logger ?? appLogger;
}

export function getRequestId(res: Response): string {
    return typeof res.locals.requestId === 'string' ? res.locals.requestId : 'unknown';
}

export function getCspNonce(res: Response): string {
    return typeof res.locals.cspNonce === 'string' ? res.locals.cspNonce : '';
}
