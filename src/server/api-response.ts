// One response shape for every API route:
//   { success: true,  data,  meta: { timestamp } }
//   { success: false, error: { code, message, details? }, meta: { timestamp } }
// Wrap each route handler in `handleRoute` so an unexpected error never leaks to the client.
import { ZodError, type z } from 'zod';

export type ApiMeta = { timestamp: string };
export type ApiErrorBody = { code: string; message: string; details?: unknown };
export type ApiSuccess<T> = { success: true; data: T; meta: ApiMeta };
export type ApiFailure = { success: false; error: ApiErrorBody; meta: ApiMeta };
export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

function meta(): ApiMeta {
  return { timestamp: new Date().toISOString() };
}

/** 200 (or `init.status`) with `{ success: true, data }`. */
export function ok<T>(data: T, init?: ResponseInit): Response {
  const body: ApiSuccess<T> = { success: true, data, meta: meta() };
  return Response.json(body, { status: 200, ...init });
}

/** An error response. `code` is a stable UPPER_SNAKE_CASE string clients can switch on. */
export function fail(status: number, code: string, message: string, details?: unknown): Response {
  const error: ApiErrorBody =
    details === undefined ? { code, message } : { code, message, details };
  const body: ApiFailure = { success: false, error, meta: meta() };
  return Response.json(body, { status });
}

/** Throw this anywhere inside a handler to answer with a specific error. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Turns anything a handler threw into a safe response. Unknown errors become a generic 500. */
export function errorToResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return fail(error.status, error.code, error.message, error.details);
  }
  if (error instanceof ZodError) {
    const issues = error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
      code: issue.code,
    }));
    return fail(400, 'VALIDATION_ERROR', 'The request is not valid', issues);
  }
  // The real error goes to the server log only. The client never sees its message,
  // because it can contain SQL, file paths or personal data.
  console.error('Unhandled error in route handler:', error);
  return fail(500, 'INTERNAL_ERROR', 'Something went wrong');
}

/**
 * Wraps a route handler so thrown errors become envelope responses.
 *
 *   export const GET = handleRoute(async (request) => ok(await listThings()));
 */
export function handleRoute<Context = unknown>(
  handler: (request: Request, context: Context) => Promise<Response>
): (request: Request, context: Context) => Promise<Response> {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      return errorToResponse(error);
    }
  };
}

/** Reads a JSON body and validates it. Bad JSON → 400 INVALID_JSON; wrong shape → 400 VALIDATION_ERROR. */
export async function readJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S
): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'The request body must be valid JSON');
  }
  return schema.parse(body);
}
