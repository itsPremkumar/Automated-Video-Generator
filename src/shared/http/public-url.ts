import { Request } from 'express';
import { PORT } from '../../constants/config';

export function baseUrl(req: Request): string {
    const configured = process.env.PUBLIC_BASE_URL?.trim();
    if (configured) {
        return configured.replace(/\/+$/, '');
    }

    const host = (req.get('host') || '').trim();
    const safeHostPattern = /^(?:[a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\])(?::\d{1,5})?$/;

    if (safeHostPattern.test(host)) {
        return `${req.protocol}://${host}`;
    }

    return `http://localhost:${PORT}`;
}

export function absoluteUrl(req: Request, pathname: string): string {
    return `${baseUrl(req)}${pathname}`;
}
