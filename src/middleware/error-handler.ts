import { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, isAppError, NotFoundError, RequestValidationError } from '../lib/errors';
import { getRequestId, getRequestLogger } from './request-context';

function normalizeError(error: unknown): AppError {
    if (isAppError(error)) {
        return error;
    }

    if (error instanceof ZodError) {
        return new RequestValidationError('Invalid request payload.', error.issues.map((issue) => ({
            path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
            message: issue.message,
        })));
    }

    if (error instanceof SyntaxError && 'body' in error) {
        return new RequestValidationError('Invalid JSON body.');
    }

    return new AppError('Internal server error');
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
    next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
    if (res.headersSent) {
        next(error);
        return;
    }

    const normalized = normalizeError(error);
    const logger = getRequestLogger(res);
    const requestId = getRequestId(res);
    const logContext = {
        code: normalized.code,
        requestId,
        statusCode: normalized.statusCode,
        details: normalized.details,
    };

    if (normalized.statusCode >= 500) {
        logger.error('request.failed', logContext, error);
    } else {
        logger.warn('request.rejected', logContext, error);
    }

    res.status(normalized.statusCode).json({
        success: false,
        error: normalized.expose ? normalized.message : 'Internal server error',
        code: normalized.code,
        requestId,
        ...(normalized.expose && normalized.details !== undefined ? { details: normalized.details } : {}),
    });
};
