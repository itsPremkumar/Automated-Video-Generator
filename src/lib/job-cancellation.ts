/**
 * Standard message used when a job is cancelled by the user.
 */
export const JOB_CANCELLATION_MESSAGE = 'Job was cancelled by the user.';

/**
 * Custom error class to identify job cancellation events
 * throughout the video generation pipeline.
 */
export class JobCancellationError extends Error {
    constructor(message: string = JOB_CANCELLATION_MESSAGE) {
        super(message);
        this.name = 'JobCancellationError';
        
        // Ensure proper prototype chain for instanceof checks
        Object.setPrototypeOf(this, JobCancellationError.prototype);
    }
}

/**
 * Type guard to check if an error is a JobCancellationError.
 */
export function isJobCancellationError(error: unknown): error is JobCancellationError {
    return error instanceof JobCancellationError;
}
