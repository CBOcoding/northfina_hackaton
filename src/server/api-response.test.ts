import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, fail, handleRoute, ok, readJsonBody, type ApiEnvelope } from './api-response';

async function body<T = unknown>(response: Response): Promise<ApiEnvelope<T>> {
  return (await response.json()) as ApiEnvelope<T>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ok', () => {
  it('wraps data in a success envelope with a timestamp', async () => {
    const response = ok({ id: 'ebike-001' });
    expect(response.status).toBe(200);
    const json = await body(response);
    expect(json).toMatchObject({ success: true, data: { id: 'ebike-001' } });
    expect(Date.parse(json.meta.timestamp)).not.toBeNaN();
  });

  it('accepts another status, e.g. 201 Created', () => {
    expect(ok({}, { status: 201 }).status).toBe(201);
  });
});

describe('fail', () => {
  it('returns the status and an error with code and message', async () => {
    const response = fail(404, 'ASSET_NOT_FOUND', 'No asset with id "x"');
    expect(response.status).toBe(404);
    expect(await body(response)).toMatchObject({
      success: false,
      error: { code: 'ASSET_NOT_FOUND', message: 'No asset with id "x"' },
    });
  });

  it('adds details only when given', async () => {
    const withoutDetails = await body(fail(409, 'CONFLICT', 'Taken'));
    expect(withoutDetails.success === false && 'details' in withoutDetails.error).toBe(false);
    const withDetails = await body(fail(409, 'CONFLICT', 'Taken', { by: 'contract-1' }));
    expect(withDetails).toMatchObject({ error: { details: { by: 'contract-1' } } });
  });
});

describe('handleRoute', () => {
  const request = new Request('http://localhost/api/test');

  it('passes through the response of a handler that succeeds', async () => {
    const handler = handleRoute(async () => ok('fine'));
    expect(await body(await handler(request, undefined))).toMatchObject({ data: 'fine' });
  });

  it('passes the route context to the handler', async () => {
    const handler = handleRoute(async (_request, context: { params: Promise<{ id: string }> }) =>
      ok((await context.params).id)
    );
    const response = await handler(request, { params: Promise.resolve({ id: 'a1' }) });
    expect(await body(response)).toMatchObject({ data: 'a1' });
  });

  it('turns an unknown error into a generic 500 and never leaks its message', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = handleRoute(async () => {
      throw new Error('SQLITE_ERROR: no such table: Asset at /home/alice/secret.db');
    });

    const response = await handler(request, undefined);

    expect(response.status).toBe(500);
    const json = await body(response);
    expect(json).toMatchObject({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
    });
    expect(JSON.stringify(json)).not.toContain('SQLITE');
    expect(log).toHaveBeenCalledOnce();
  });

  it('turns a ZodError into 400 VALIDATION_ERROR with the issues as details', async () => {
    const handler = handleRoute(async () => {
      z.object({ status: z.enum(['available']) }).parse({ status: 'lost' });
      return ok(null);
    });

    const response = await handler(request, undefined);

    expect(response.status).toBe(400);
    expect(await body(response)).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        details: [{ path: 'status', code: 'invalid_value' }],
      },
    });
  });

  it('turns an ApiError into its own status and code', async () => {
    const handler = handleRoute(async () => {
      throw new ApiError(409, 'ASSET_RESERVED', 'Already reserved', { assetId: 'ebike-009' });
    });
    const response = await handler(request, undefined);
    expect(response.status).toBe(409);
    expect(await body(response)).toMatchObject({
      error: {
        code: 'ASSET_RESERVED',
        message: 'Already reserved',
        details: { assetId: 'ebike-009' },
      },
    });
  });
});

describe('readJsonBody', () => {
  const schema = z.object({ actor: z.string() });
  const post = (text: string) => new Request('http://localhost', { method: 'POST', body: text });

  it('returns the parsed, validated body', async () => {
    await expect(readJsonBody(post('{"actor":"aino"}'), schema)).resolves.toEqual({
      actor: 'aino',
    });
  });

  it('throws INVALID_JSON for a body that is not JSON', async () => {
    await expect(readJsonBody(post('{oops'), schema)).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_JSON',
    });
  });

  it('throws a ZodError for JSON of the wrong shape', async () => {
    await expect(readJsonBody(post('{"actor":1}'), schema)).rejects.toBeInstanceOf(z.ZodError);
  });
});
