// Request validation only: only the application path is accepted, refused before the database.
import { describe, expect, it, vi } from 'vitest';
import { POST } from './route';

vi.mock('@/server/db', () => ({ db: {} })); // never reached: validation fails first

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/contracts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    undefined
  );

describe('POST /api/contracts body', () => {
  it.each([
    [
      'a direct lease (customer and items, no application)',
      {
        customerId: 'cust-aino',
        signedBy: 'Aino Virtanen',
        items: [{ assetId: 'ebike-003' }],
        quotedOn: '2026-11-05',
        signedOn: '2026-11-05',
        downPaymentCents: 0,
        termMonths: 36,
        actor: 'customer',
      },
    ],
    [
      'an application with an extra key',
      { applicationId: 'app-1', signedBy: 'A', actor: 'customer', quotedOn: '2025-01-01' },
    ],
    [
      'an application with chosen items',
      { applicationId: 'app-1', signedBy: 'A', actor: 'customer', items: [{ assetId: 'x' }] },
    ],
  ])('rejects %s with 400 VALIDATION_ERROR', async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR');
  });
});
