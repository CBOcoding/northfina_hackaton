import { describe, expect, it } from 'vitest';
import { isSignable, parseReasons } from './signing';

describe('isSignable', () => {
  it('signs an approved application', () => {
    expect(isSignable({ decision: 'approved', reasons: [] })).toBe(true);
  });

  it('signs a pending one that only waits for the authorised signatory', () => {
    expect(isSignable({ decision: 'pending', reasons: ['SIGNATORY_REQUIRED'] })).toBe(true);
    expect(
      isSignable({ decision: 'pending', reasons: ['SIGNATORY_REQUIRED', 'SIGNATORY_REQUIRED'] })
    ).toBe(true);
  });

  it('refuses a pending one with another reason too, or with no reason', () => {
    expect(isSignable({ decision: 'pending', reasons: ['SIGNATORY_REQUIRED', 'PEP'] })).toBe(false);
    expect(isSignable({ decision: 'pending', reasons: [] })).toBe(false);
  });

  it('refuses rejected and manual review, whatever the reasons', () => {
    expect(isSignable({ decision: 'rejected', reasons: ['SIGNATORY_REQUIRED'] })).toBe(false);
    expect(isSignable({ decision: 'manual_review', reasons: ['SIGNATORY_REQUIRED'] })).toBe(false);
  });
});

describe('parseReasons', () => {
  it('accepts [{ code }] and ["CODE"]', () => {
    expect(parseReasons('[{"code":"SIGNATORY_REQUIRED","message":"x"}]')).toEqual([
      'SIGNATORY_REQUIRED',
    ]);
    expect(parseReasons('["SIGNATORY_REQUIRED","PEP"]')).toEqual(['SIGNATORY_REQUIRED', 'PEP']);
  });

  it('skips entries without a string code', () => {
    expect(parseReasons('[{"code":1},null,{},"PEP"]')).toEqual(['PEP']);
  });

  it('treats broken JSON and non-lists as no reasons', () => {
    expect(parseReasons('{not json')).toEqual([]);
    expect(parseReasons('{"code":"PEP"}')).toEqual([]);
    expect(parseReasons('')).toEqual([]);
  });
});
