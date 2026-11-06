// Request validation only: bad bodies are refused before anything touches the database.
import { describe, expect, it, vi } from 'vitest';
import { createApplication } from '@/server/applications';
import { POST } from './route';

vi.mock('@/server/db', () => ({ db: {} })); // never reached: validation fails first
vi.mock('@/server/applications', () => ({ createApplication: vi.fn() }));

const postBody = (over: Record<string, unknown>) =>
  POST(
    new Request('http://localhost/api/applications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        customerId: 'cust-aino',
        items: [{ assetId: 'ebike-001', quantity: 1 }],
        termMonths: 24,
        downPaymentCents: 0,
        answers: {},
        ...over,
      }),
    }),
    undefined
  );
const post = (answers: unknown) => postBody({ answers });

describe('POST /api/applications answers bounds', () => {
  it.each([
    [
      'more than 50 keys',
      Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`q_${i}`, 'x'])),
    ],
    ['a string over 500 chars', { q_email: 'x'.repeat(501) }],
    ['a list over 20 items', { q_beneficial_owners: Array.from({ length: 21 }, () => 'x') }],
    ['a nested object', { q_email: { a: 1 } }],
    ['a list item over 500 chars', { q_beneficial_owners: ['x'.repeat(501)] }],
  ])('rejects %s with 400 VALIDATION_ERROR', async (_name, answers) => {
    const res = await post(answers);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/applications request bounds', () => {
  it.each([
    ['more than one unit of an item', { items: [{ assetId: 'ebike-001', quantity: 2 }] }],
    ['a down payment over 2 147 483 647 cents', { downPaymentCents: 2_147_483_648 }],
  ])('rejects %s with 400 VALIDATION_ERROR', async (_name, over) => {
    const res = await postBody(over);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR');
    expect(createApplication).not.toHaveBeenCalled();
  });

  it('maps a down payment above the cap to 400 DOWN_PAYMENT_TOO_HIGH with the max in cents', async () => {
    vi.mocked(createApplication).mockResolvedValueOnce({
      ok: false,
      reason: 'down_payment_too_high',
      maxCents: 288_000,
    });
    const res = await postBody({ downPaymentCents: 500_000 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatchObject({
      code: 'DOWN_PAYMENT_TOO_HIGH',
      details: 288_000,
    });
  });
});
