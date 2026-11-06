// How the route answers each result of changeAssetStatus (stubbed: no database here).
import { describe, expect, it, vi } from 'vitest';
import { changeAssetStatus } from '@/server/assets';
import { PATCH } from './route';

vi.mock('@/server/db', () => ({ db: {} }));
vi.mock('@/server/assets', () => ({ changeAssetStatus: vi.fn() }));

const patch = () =>
  PATCH(
    new Request('http://localhost/api/assets/ebike-001/status', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'available', actor: 'team-test' }),
    }),
    { params: Promise.resolve({ id: 'ebike-001' }) }
  );

describe('PATCH /api/assets/:id/status', () => {
  it.each([
    ['under_contract', 409, 'ASSET_UNDER_CONTRACT'],
    ['not_found', 404, 'ASSET_NOT_FOUND'],
  ] as const)('answers %s with %i %s', async (reason, status, code) => {
    vi.mocked(changeAssetStatus).mockResolvedValueOnce({ ok: false, reason });
    const res = await patch();
    expect(res.status).toBe(status);
    expect((await res.json()).error.code).toBe(code);
  });
});
