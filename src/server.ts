import express, { Request, Response, NextFunction } from 'express';
import { generateVideo } from './video-generator';
import * as path from 'path';
import { config } from 'dotenv';

config();

const app = express();
const PORT = process.env.PORT || 3001;

// Rate limiting - simple in-memory implementation
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 10; // 10 requests per window

function rateLimiter(req: Request, res: Response, next: NextFunction) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    const record = rateLimitMap.get(ip);

    if (!record || now > record.resetTime) {
        rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
        return next();
    }

    if (record.count >= RATE_LIMIT_MAX) {
        const retryAfter = Math.ceil((record.resetTime - now) / 1000);
        res.set('Retry-After', String(retryAfter));
        return res.status(429).json({
            error: 'Too many requests',
            retryAfter: retryAfter,
        });
    }

    record.count++;
    next();
}

// Security middleware
app.use((req: Request, res: Response, next: NextFunction) => {
    // Security headers
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('X-XSS-Protection', '1; mode=block');
    next();
});

// CORS - allow all origins for development
app.use((req: Request, res: Response, next: NextFunction) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    next();
});

// Request size limit (10KB max for JSON body)
app.use(express.json({ limit: '10kb' }));

// Health check (no rate limit)
app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'video-generator' });
});

// Input validation
function validateScript(script: any): { valid: boolean; error?: string } {
    if (!script || typeof script !== 'string') {
        return { valid: false, error: 'Script is required and must be a string' };
    }

    const trimmed = script.trim();

    if (trimmed.length < 10) {
        return { valid: false, error: 'Script is too short (minimum 10 characters)' };
    }

    if (trimmed.length > 5000) {
        return { valid: false, error: 'Script is too long (maximum 5000 characters)' };
    }

    return { valid: true };
}

// Generate video endpoint (with rate limiting)
app.post('/generate-video', rateLimiter, async (req: Request, res: Response) => {
    try {
        const { script, style = 'professional' } = req.body;

        // Validate input
        const validation = validateScript(script);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                error: validation.error
            });
        }

        // Sanitize style input
        const allowedStyles = ['professional', 'casual', 'energetic'];
        const sanitizedStyle = allowedStyles.includes(style) ? style : 'professional';

        // console.log(`\n🎬 [API Request] Generating video (${sanitizedStyle} style)`);

        const outputDir = path.join(process.cwd(), 'output');
        const result = await generateVideo(script.trim(), outputDir);

        if (result.success) {
            res.json({
                success: true,
                message: 'Video generation completed',
                data: {
                    outputPath: result.outputPath,
                    metadata: result.metadata,
                },
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error,
            });
        }
    } catch (error: any) {
        // console.error('API Error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
        });
    }
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    // console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
    });
});

app.listen(PORT, () => {
    // console.log(`\n🚀 Video Generator Server running on http://localhost:${PORT}`);
    // console.log(`\n🔒 Security Features:`);
    // console.log(`   ✓ Rate limiting: ${RATE_LIMIT_MAX} requests per ${RATE_LIMIT_WINDOW_MS / 60000} minutes`);
    // console.log(`   ✓ CORS enabled`);
    // console.log(`   ✓ Request size limit: 10KB`);
    // console.log(`   ✓ Input validation`);
    // console.log(`\n📋 API Endpoints:`);
    // console.log(`   GET  /health`);
    // console.log(`   POST /generate-video`);
    // console.log(`\n💡 Example request:`);
    // console.log(`   curl -X POST http://localhost:${PORT}/generate-video \\`);
    // console.log(`     -H "Content-Type: application/json" \\`);
    // console.log(`     -d '{"script":"Your marketing script here"}'`);
    // console.log('\n');
});

