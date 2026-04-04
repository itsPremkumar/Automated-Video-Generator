import express, { Request, Response, NextFunction } from 'express';
import apiRoutes from './routes/api.routes';
import viewRoutes from './routes/view.routes';
import fileRoutes from './routes/file.routes';
import * as ApiController from './controllers/api.controller';
import { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS } from './constants/config';

// Rate Limiter
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
function rateLimiter(req: any, res: any, next: any) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const record = rateLimitMap.get(ip);

    if (!record || now > record.resetTime) {
        rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
        next();
        return;
    }

    if (record.count >= RATE_LIMIT_MAX) {
        const retryAfter = Math.ceil((record.resetTime - now) / 1000);
        res.set('Retry-After', String(retryAfter));
        res.status(429).json({ success: false, error: 'Too many requests', retryAfter });
        return;
    }

    record.count += 1;
    next();
}

const app = express();

// Security Headers
app.use((req: Request, res: Response, next: NextFunction) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('X-XSS-Protection', '1; mode=block');
    next();
});

// CORS
app.use((req: Request, res: Response, next: NextFunction) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }
    next();
});

app.use(express.json({ limit: '10kb' }));

// NoIndex for dynamic/API routes
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

// Routes
app.post('/generate-video', rateLimiter, ApiController.startJobController);
app.use('/api', apiRoutes);
app.use(fileRoutes);
app.use(viewRoutes);

// Error Handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Express Error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
});

export { app as expressApp };
export default app;
