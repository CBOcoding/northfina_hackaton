// Who may sign an application. Pure rules; the server reads the stored application and asks here.

/**
 * Can this application be signed? Approved ones can. So can one that only waits for the
 * company's authorised signatory (card 6): that person signs it, the applicant cannot.
 */
export function isSignable(application: { decision: string; reasons: readonly string[] }): boolean {
  if (application.decision === 'approved') return true;
  return (
    application.decision === 'pending' &&
    application.reasons.length > 0 &&
    application.reasons.every((code) => code === 'SIGNATORY_REQUIRED')
  );
}

/** Stored reason codes; accepts [{ code }] or ["CODE"], broken JSON counts as none. */
export function parseReasons(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)) return [];
    return value.flatMap((r: unknown) =>
      typeof r === 'string'
        ? [r]
        : r !== null && typeof r === 'object' && typeof (r as { code?: unknown }).code === 'string'
          ? [(r as { code: string }).code]
          : []
    );
  } catch {
    return [];
  }
}
