// Signs the contracts the scenario cards talk about, so the contract pages can be demoed
// before the application flow is finished. Safe to run again: it skips a card whose asset
// is already leased. Run: npx tsx --env-file=.env scripts/seed-demo-contracts.ts
import { signLease, loadLeaseData, type SignLeaseInput } from '@/server/contracts';
import { createPrismaClient } from '@/server/prisma-client';

const cards: { card: string; input: Omit<SignLeaseInput, 'actor'> }[] = [
  {
    card: 'Card 1: Aino, ebike-003, 36 months from 5 Nov 2026',
    input: {
      customerId: 'cust-aino',
      signedBy: 'Aino Virtanen',
      items: [{ assetId: 'ebike-003' }],
      quotedOn: '2026-11-05',
      signedOn: '2026-11-05',
      downPaymentCents: 0,
      termMonths: 36,
    },
  },
  {
    card: 'Card 2: laptop-004 quoted Thu 5 Nov (v1), signed Fri 6 Nov (v2)',
    input: {
      customerId: 'cust-kettukoodi',
      signedBy: 'Kettu Koodi Oy',
      items: [{ assetId: 'laptop-004' }],
      quotedOn: '2026-11-05',
      signedOn: '2026-11-06',
      downPaymentCents: 0,
      termMonths: 36,
    },
  },
  {
    card: 'Card 3: ebike-001, 24 months from 15 Sep 2026',
    input: {
      customerId: 'cust-pekka',
      signedBy: 'Pekka Korhonen',
      items: [{ assetId: 'ebike-001' }],
      quotedOn: '2026-09-15',
      signedOn: '2026-09-15',
      downPaymentCents: 0,
      termMonths: 24,
    },
  },
  {
    card: 'Card 4: laptop-001, 36 months from 31 Jan 2026',
    input: {
      customerId: 'cust-kettukoodi',
      signedBy: 'Kettu Koodi Oy',
      items: [{ assetId: 'laptop-001' }],
      quotedOn: '2026-01-31',
      signedOn: '2026-01-31',
      downPaymentCents: 0,
      termMonths: 36,
    },
  },
];

const db = createPrismaClient();
try {
  const data = await loadLeaseData();
  for (const { card, input } of cards) {
    const result = await signLease(db, data, { ...input, actor: 'demo-seed' });
    console.log(
      result.ok
        ? `✅ ${result.stored.contract.number}  ${card}`
        : `⏭️  skipped (${result.reason})  ${card}`
    );
  }
} finally {
  await db.$disconnect();
}
