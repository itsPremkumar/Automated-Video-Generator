import express, { NextFunction, Request, Response } from 'express';
import apiRoutes from './routes/api.routes';
import viewRoutes from './routes/view.routes';
import fileRoutes from './routes/file.routes';
import * as ApiController from './controllers/api.controller';
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from './constants/config';
import { resolveProjectPath } from './runtime';
import { ForbiddenError } from './lib/errors';
import { asyncHandler, validateRequest } from './lib/validation';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { requestContextMiddleware } from './middleware/request-context';
import { createMemoryRateLimiter } from './middleware/rate-limit';
import { startJobBodySchema } from './schemas/api.schemas';

function parseAllowedOrigins(): Set<string> {
    const configured = process.env.ALLOWED_ORIGINS || '';
    return new Set(
        configured
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
    );
}

function isLoopbackOrigin(origin: string): boolean {
    try {
        const parsed = new URL(origin);
        return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    } catch {
        return false;
    }
}

function resolvePublicBaseOrigin(): string | null {
    const configuredBaseUrl = process.env.PUBLIC_BASE_URL?.trim();
    if (!configuredBaseUrl) {
        return null;
    }

    try {
        return new URL(configuredBaseUrl).origin;
    } catch {
        return null;
    }
}

const configuredOrigins = parseAllowedOrigins();
const publicBaseOrigin = resolvePublicBaseOrigin();

function isAllowedOrigin(origin: string): boolean {
    if (configuredOrigins.size > 0) {
        return configuredOrigins.has(origin);
    }

    if (publicBaseOrigin) {
        return origin === publicBaseOrigin || isLoopbackOrigin(origin);
    }

    return isLoopbackOrigin(origin);
}

const startJobLimiter = createMemoryRateLimiter({
    keyPrefix: 'legacy-start-job',
    max: RATE_LIMIT_MAX,
    windowMs: RATE_LIMIT_WINDOW_MS,
});

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1');

app.use(requestContextMiddleware);

app.use((req: Request, res: Response, next: NextFunction) => {
    const nonce = typeof res.locals.cspNonce === 'string' ? res.locals.cspNonce : '';

    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'same-origin');
    res.set('Permissions-Policy', 'camera=(), geolocation=(), microphone=()');
    res.set('Cross-Origin-Opener-Policy', 'same-origin');
    res.set('Cross-Origin-Resource-Policy', 'same-origin');
    res.set('X-XSS-Protection', '0');

    const csp = [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}'`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "media-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
    ].join('; ');

    res.set('Content-Security-Policy', csp);
    next();
});

app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (!origin) {
        if (req.method === 'OPTIONS') {
            res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
            res.set('Access-Control-Allow-Headers', 'Content-Type, X-Request-Id');
            res.status(204).end();
            return;
        }

        next();
        return;
    }

    if (!isAllowedOrigin(origin)) {
        if (req.method === 'OPTIONS') {
            res.status(403).end();
            return;
        }

        next(new ForbiddenError('Origin not allowed.'));
        return;
    }

    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-Request-Id');
    res.set('Vary', 'Origin');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    next();
});

app.use(express.json({ limit: '32kb', strict: true }));

app.use((req: Request, res: Response, next: NextFunction) => {
    if (
        req.path === '/generate-video' ||
        req.path === '/health' ||
        req.path.startsWith('/api/') ||
        req.path.startsWith('/download/') ||
        req.path.startsWith('/files/') ||
        req.path.startsWith('/jobs/')
    ) {
        res.set('X-Robots-Tag', 'noindex, nofollow');
    }
    next();
});

app.use(express.static(resolveProjectPath('public')));
app.use('/assets/input', express.static(resolveProjectPath('input')));

app.post(
    '/generate-video',
    startJobLimiter,
    validateRequest({ body: startJobBodySchema }),
    asyncHandler(ApiController.startJobController),
);

app.use('/api', apiRoutes);
app.use(fileRoutes);
app.use(viewRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export { app as expressApp };
export default app;
