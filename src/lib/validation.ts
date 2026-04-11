import { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodSchema } from 'zod';
import { RequestValidationError } from './errors';

/**
 * Wraps an async request handler for automatic error catching and passing to Express next()
 */
export function asyncHandler(fn: RequestHandler): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
        return Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Express middleware for validating request body, query, and params against Zod schemas
 */
export function validateRequest(schemas: {
    body?: ZodSchema;
    query?: ZodSchema;
    params?: ZodSchema;
}): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            if (schemas.body) {
                req.body = schemas.body.parse(req.body);
            }
            if (schemas.query) {
                req.query = schemas.query.parse(req.query) as any;
            }
            if (schemas.params) {
                req.params = schemas.params.parse(req.params) as any;
            }
            next();
        } catch (error) {
            next(error);
        }
    };
}
