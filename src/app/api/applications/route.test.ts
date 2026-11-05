// Request validation only: bad bodies are refused before anything touches the database.
import { describe, expect, it, vi } from 'vitest';
import { POST } from './route';

vi.mock('@/server/db', () => ({ db: {} })); // never reached: validation fails first

const post = (answers: unknown) =>
  POST(
    new Request('http://localhost/api/applications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        customerId: 'cust-aino',
        items: [{ assetId: 'ebike-001', quantity: 1 }],
        termMonths: 24,
        downPaymentCents: 0,
        answers,
      }),
    }),
    undefined
  );

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
