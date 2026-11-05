// What the catalogue may promise for an item, from its list price alone.
// Limits come from the coefficient table (lowest and highest band edge), never hard-coded.
import type { CoefficientTable } from '@/data/schemas';

export type LeaseOffer =
  | { kind: 'leasable' }
  | { kind: 'too_cheap'; minCents: number }
  | { kind: 'needs_down_payment'; minDownCents: number };

/**
 * `listPriceCents` is the net list price in euro cents. Financed = price - down payment, and it
 * must sit inside the table's limits (both inclusive). A price below the lowest limit cannot be
 * fixed by a down payment (it only lowers the financed amount). A price above the highest limit
 * needs at least `price - max` as down payment.
 */
export function leaseOffer(listPriceCents: number, table: CoefficientTable): LeaseOffer {
  if (!Number.isInteger(listPriceCents)) {
    throw new RangeError(`listPriceCents must be whole cents, got ${listPriceCents}`);
  }
  const minCents = Math.min(...table.bands.map((b) => b.min_financed_cents));
  const maxCents = Math.max(...table.bands.map((b) => b.max_financed_cents));
  if (listPriceCents < minCents) return { kind: 'too_cheap', minCents };
  if (listPriceCents > maxCents) {
    return { kind: 'needs_down_payment', minDownCents: listPriceCents - maxCents };
  }
  return { kind: 'leasable' };
}
