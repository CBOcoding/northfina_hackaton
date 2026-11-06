// Request validation only: bad bodies are refused before anything touches the database.
import { describe, expect, it, vi } from 'vitest';
import { POST } from './route';

vi.mock('@/server/db', () => ({ db: {} })); // never reached: validation fails first

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/contracts/ML-2026-0001/end', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ number: 'ML-2026-0001' }) }
  );

describe('POST /api/contracts/:number/end validation', () => {
  it.each([
    ['an unknown choice', { choice: 'sell', actor: 'aino' }],
    ['no actor', { choice: 'buy' }],
    [
      'a made-up condition',
      { choice: 'return', actor: 'a', reports: { x: { condition: 'shiny', usageValue: 1 } } },
    ],
    [
      'negative usage',
      { choice: 'return', actor: 'a', reports: { x: { condition: 'good', usageValue: -1 } } },
    ],
    ['a date from the browser', { choice: 'buy', actor: 'a', endedOn: '2026-01-01' }],
    [
      'more than 50 reports',
      {
        choice: 'return',
        actor: 'a',
        reports: Object.fromEntries(
          Array.from({ length: 51 }, (_, i) => [`a-${i}`, { condition: 'good', usageValue: 1 }])
        ),
      },
    ],
  ])('rejects %s with 400 VALIDATION_ERROR', async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('VALIDATION_ERROR');
  });
});
