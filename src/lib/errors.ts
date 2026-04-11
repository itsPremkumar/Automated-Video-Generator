/**
 * Base class for all application errors
 */
export class AppError extends Error {
    public readonly statusCode: number;
    public readonly code: string;
    public readonly details?: any;
    public readonly expose: boolean;

    constructor(
        message: string,
        statusCode: number = 500,
        code: string = 'internal_error',
        details?: any,
        expose: boolean = true
    ) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.expose = expose;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * 404 Not Found helper
 */
export class NotFoundError extends AppError {
    constructor(message: string = 'Resource not found.', details?: any) {
        super(message, 404, 'not_found', details);
    }
}

/**
 * 400 Bad Request helper
 */
export class BadRequestError extends AppError {
    constructor(message: string = 'Bad request.', details?: any) {
        super(message, 400, 'bad_request', details);
    }
}

/**
 * 403 Forbidden helper
 */
export class ForbiddenError extends AppError {
    constructor(message: string = 'Forbidden.', details?: any) {
        super(message, 403, 'forbidden', details);
    }
}

/**
 * 422 Unprocessable Entity helper for validation errors
 */
export class RequestValidationError extends AppError {
    constructor(message: string = 'Validation failed.', details?: any) {
        super(message, 422, 'validation_failed', details);
    }
}

/**
 * 409 Conflict helper
 */
export class ConflictError extends AppError {
    constructor(message: string = 'Conflict.', details?: any) {
        super(message, 409, 'conflict', details);
    }
}

/**
 * 429 Too Many Requests helper
 */
export class TooManyRequestsError extends AppError {
    constructor(message: string = 'Too many requests.', details?: any) {
        super(message, 429, 'too_many_requests', details);
    }
}

/**
 * 503 Service Unavailable helper
 */
export class ServiceUnavailableError extends AppError {
    constructor(message: string = 'Service unavailable.', details?: any) {
        super(message, 503, 'service_unavailable', details);
    }
}

/**
 * Type guard for AppError
 */
export function isAppError(error: unknown): error is AppError {
    return error instanceof AppError;
}
