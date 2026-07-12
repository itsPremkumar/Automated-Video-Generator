import assert from 'node:assert/strict';
import test from 'node:test';
import { validateRequest } from './validation';
import { ZodSchema, z } from 'zod';

test('validateRequest passes valid body through', () => {
    const schema = z.object({ name: z.string() });
    const middleware = validateRequest({ body: schema });

    const req = { body: { name: 'test' } } as any;
    let nextCalled = false;

    middleware(req, {} as any, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.body.name, 'test');
});

test('validateRequest passes error to next for invalid body', () => {
    const schema = z.object({ name: z.string() });
    const middleware = validateRequest({ body: schema });

    const req = { body: { name: 123 } } as any;
    let nextError: any = null;

    middleware(req, {} as any, (err: any) => {
        nextError = err;
    });

    assert.ok(nextError);
});
