// Zod schemas for every file in data/. Read these as documentation: they say exactly what
// each field is. The loaders in ./load.ts check every file against its schema at startup.
//
// House rules used throughout the data pack:
// - Money is an integer number of euro cents, VAT excluded, unless the name says otherwise.
// - Dates are ISO calendar dates, `YYYY-MM-DD`. Date ranges include both ends.
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

/** ISO calendar date, `YYYY-MM-DD`. Two ISO dates compare correctly as strings. */
export const isoDateSchema = z.iso.date();

/** Integer euro cents, never negative. 189900 means 1 899,00 €. */
export const centsSchema = z.number().int().nonnegative();

/** A lease term in months, as used for object keys in the data pack ("12", "24", ...). */
export const termMonthsKeySchema = z
  .string()
  .regex(/^\d+$/, 'term must be a whole number of months');

export const assetCategorySchema = z.enum(['e_bike', 'laptop', 'farm_machine']);
export type AssetCategory = z.infer<typeof assetCategorySchema>;

/** Best first. A returned item usually needs refurbishment to move up. */
export const assetConditionSchema = z.enum(['new', 'like_new', 'good', 'fair', 'poor']);
export type AssetCondition = z.infer<typeof assetConditionSchema>;

export const assetStatusSchema = z.enum(['available', 'reserved', 'returned']);
export type AssetStatus = z.infer<typeof assetStatusSchema>;

/** What the usage counter measures: km for e-bikes, battery cycles for laptops, engine hours for farm machines. */
export const usageUnitSchema = z.enum(['km', 'battery_cycles', 'engine_hours']);
export type UsageUnit = z.infer<typeof usageUnitSchema>;

const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/, 'two-letter country code, e.g. FI');

// ---------------------------------------------------------------------------
// data/assets.json: every physical item in the catalogue, new or with previous lives.
// ---------------------------------------------------------------------------

export const assetSchema = z.strictObject({
  id: z.string().min(1),
  category: assetCategorySchema,
  make: z.string().min(1),
  model: z.string().min(1),
  model_year: z.number().int(),
  serial_number: z.string().min(1),
  condition: assetConditionSchema,
  usage: z.strictObject({ unit: usageUnitSchema, value: z.number().int().nonnegative() }),
  /** How many lease contracts this item has already been through. */
  previous_lives: z.number().int().nonnegative(),
  status: assetStatusSchema,
});
export type Asset = z.infer<typeof assetSchema>;
export const assetsFileSchema = z.array(assetSchema);

// ---------------------------------------------------------------------------
// data/price-lists.json: dated versions of the net list price of each asset.
// ---------------------------------------------------------------------------

export const priceListSchema = z.strictObject({
  version: z.number().int().positive(),
  valid_from: isoDateSchema,
  /** Last day this list applies (inclusive). `null` means "until a newer list replaces it". */
  valid_to: isoDateSchema.nullable(),
  note: z.string(),
  /** Asset id → net list price in cents. */
  prices: z.record(z.string(), centsSchema),
});
export type PriceList = z.infer<typeof priceListSchema>;

export const priceListsFileSchema = z.array(priceListSchema).superRefine((lists, ctx) => {
  // Lists must not overlap, so exactly one (or none) applies on any date.
  const sorted = [...lists].sort((a, b) => a.valid_from.localeCompare(b.valid_from));
  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    if (
      previous &&
      current &&
      (previous.valid_to === null || previous.valid_to >= current.valid_from)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: `price list ${previous.version} overlaps price list ${current.version}`,
      });
    }
  }
});

// ---------------------------------------------------------------------------
// data/coefficient-table.json: monthly rent factor by financed amount (band) and term.
// monthly net rent = financed amount × factor.
// ---------------------------------------------------------------------------

export const coefficientBandSchema = z.strictObject({
  band: z.string().min(1),
  /** Smallest financed amount in this band (inclusive). */
  min_financed_cents: centsSchema,
  /** Largest financed amount in this band (inclusive). */
  max_financed_cents: centsSchema,
  annual_interest_percent: z.number().nonnegative(),
  /** Term in months ("12", "24", ...) → monthly factor. */
  monthly_factor_by_term: z.record(termMonthsKeySchema, z.number().positive()),
});
export type CoefficientBand = z.infer<typeof coefficientBandSchema>;

export const coefficientTableSchema = z
  .strictObject({
    id: z.string(),
    version: z.number().int().positive(),
    valid_from: isoDateSchema,
    currency: z.literal('EUR'),
    how_to_use: z.string(),
    /** Term in months → price to buy the item at the end, as a percent of the financed amount. */
    end_of_term_buyout_percent_of_financed: z.record(
      termMonthsKeySchema,
      z.number().min(0).max(100)
    ),
    /** Sorted from the smallest amounts up, with no gaps or overlaps. */
    bands: z.array(coefficientBandSchema).min(1),
  })
  .superRefine((table, ctx) => {
    table.bands.forEach((band, i) => {
      if (band.min_financed_cents > band.max_financed_cents) {
        ctx.addIssue({ code: 'custom', message: `band ${band.band}: min is above max` });
      }
      const previous = table.bands[i - 1];
      if (previous && band.min_financed_cents !== previous.max_financed_cents + 1) {
        ctx.addIssue({
          code: 'custom',
          message: `band ${band.band} must start 1 cent after band ${previous.band} ends`,
        });
      }
    });
  });
export type CoefficientTable = z.infer<typeof coefficientTableSchema>;

// ---------------------------------------------------------------------------
// data/residual-curves.json: what a used item is worth, by age, condition and usage.
// ---------------------------------------------------------------------------

/** `[age_months, percent_of_original_net_list_price]` */
export const residualCurvePointSchema = z.tuple([
  z.number().int().nonnegative(),
  z.number().min(0).max(100),
]);

export const usageAdjustmentSchema = z.strictObject({
  unit: usageUnitSchema,
  /** Value change per `step` units of usage, in percent (negative = loses value). */
  percent_per_step: z.number(),
  step: z.number().positive(),
  /** The adjustment never goes beyond this (negative) percent. */
  max_total_percent: z.number(),
});

export const residualCurvesSchema = z.strictObject({
  how_to_use: z.string(),
  curves: z.record(assetCategorySchema, z.array(residualCurvePointSchema).min(1)),
  condition_multiplier: z.record(assetConditionSchema, z.number().min(0)),
  usage_adjustment: z.record(assetCategorySchema, usageAdjustmentSchema),
});
export type ResidualCurves = z.infer<typeof residualCurvesSchema>;

// ---------------------------------------------------------------------------
// data/vat-rates.json: Finnish general VAT rate over time (one future change is fictional).
// ---------------------------------------------------------------------------

export const vatRateSchema = z.strictObject({
  rate_percent: z.number().min(0),
  valid_from: isoDateSchema,
  /** Inclusive. `null` means "still valid". */
  valid_to: isoDateSchema.nullable(),
  /** True for the made-up hackathon rate. */
  fictional: z.boolean().optional(),
});
export type VatRate = z.infer<typeof vatRateSchema>;

export const vatRatesSchema = z.strictObject({
  country: countryCodeSchema,
  note: z.string(),
  rates: z.array(vatRateSchema).min(1),
});
export type VatRates = z.infer<typeof vatRatesSchema>;

// ---------------------------------------------------------------------------
// data/questions.json: the application form, as data. Which question is asked depends on
// earlier answers and on the deal (see `ask_when`).
// ---------------------------------------------------------------------------

/** Text in all four app languages. */
export const translatedTextSchema = z.strictObject({
  en: z.string(),
  fi: z.string(),
  sv: z.string(),
  et: z.string(),
});

/** Text that is always in English and may have translations. */
export const localizedTextSchema = z.strictObject({
  en: z.string(),
  fi: z.string().optional(),
  sv: z.string().optional(),
  et: z.string().optional(),
});

/**
 * Which value a condition looks at: a deal field, or an earlier answer (`answers.<question id>`).
 */
export const conditionFieldSchema = z
  .string()
  .regex(
    /^(customer_type|category|financed_amount_cents|term_months|answers\.q_[a-z0-9_]+)$/,
    'unknown condition field'
  );

/** One condition in `ask_when`. A question is asked only when all its conditions hold. */
export const askWhenConditionSchema = z.discriminatedUnion('op', [
  z.strictObject({
    field: conditionFieldSchema,
    op: z.literal('in'),
    value: z.array(z.string()).min(1),
  }),
  z.strictObject({ field: conditionFieldSchema, op: z.literal('gte'), value: z.number() }),
  z.strictObject({ field: conditionFieldSchema, op: z.literal('lte'), value: z.number() }),
]);
export type AskWhenCondition = z.infer<typeof askWhenConditionSchema>;

/** An answer that stops the application (for example, applicant under 18). */
export const blockRuleSchema = z.discriminatedUnion('rule', [
  z.strictObject({ rule: z.literal('age_under'), value: z.number().int().positive() }),
  z.strictObject({ rule: z.literal('answer_in'), value: z.array(z.string()).min(1) }),
]);

export const questionTypeSchema = z.enum(['choice', 'text', 'date', 'email', 'money', 'list']);

export const questionSchema = z
  .strictObject({
    id: z.string().regex(/^q_[a-z0-9_]+$/),
    type: questionTypeSchema,
    text: translatedTextSchema,
    why_we_ask: localizedTextSchema,
    /** Empty list = always ask. */
    ask_when: z.array(askWhenConditionSchema),
    /** Allowed answers; only for `choice` questions. */
    options: z.array(z.string()).min(1).optional(),
    blocks_application_when: z.array(blockRuleSchema).optional(),
    validation: z
      .strictObject({ format: z.literal('finnish_business_id'), hint: z.string() })
      .optional(),
  })
  .refine((q) => (q.type === 'choice') === (q.options !== undefined), {
    message: 'choice questions need options, other questions must not have them',
  });
export type Question = z.infer<typeof questionSchema>;

export const eligibilityRuleSchema = z.strictObject({ id: z.string(), text: z.string() });
export type EligibilityRule = z.infer<typeof eligibilityRuleSchema>;

export const questionsFileSchema = z.strictObject({
  how_to_use: z.string(),
  eligibility_rules: z.array(eligibilityRuleSchema),
  questions: z.array(questionSchema).min(1),
});
export type QuestionsFile = z.infer<typeof questionsFileSchema>;

// ---------------------------------------------------------------------------
// data/customers.json: test applicants, each built to exercise one rule (read `story`).
// ---------------------------------------------------------------------------

const customerBase = {
  id: z.string().min(1),
  name: z.string().min(1),
  country: countryCodeSchema,
  city: z.string(),
  email: z.email(),
  is_pep: z.boolean(),
  /** Why this test customer exists. */
  story: z.string(),
};

export const employmentSchema = z.enum([
  'employed',
  'self_employed',
  'student',
  'retired',
  'unemployed',
]);

export const consumerSchema = z.strictObject({
  ...customerBase,
  type: z.literal('consumer'),
  birth_date: isoDateSchema,
  employment: employmentSchema,
  monthly_net_income_cents: centsSchema,
});

export const soleTraderSchema = z.strictObject({
  ...customerBase,
  type: z.literal('sole_trader'),
  /** Finnish business ID, `1234567-8`. The check digit is NOT validated here: that is your job. */
  business_id: z.string(),
  birth_date: isoDateSchema,
  vat_registered: z.boolean(),
});

export const companySchema = z.strictObject({
  ...customerBase,
  type: z.literal('company'),
  /** Finnish business ID, `1234567-8`. The check digit is NOT validated here: that is your job. */
  business_id: z.string(),
  vat_registered: z.boolean(),
  annual_revenue_cents: centsSchema,
  /** Whether the person applying may sign contracts for the company. */
  applicant_can_sign: z.boolean(),
  beneficial_owners: z.array(z.string()).optional(),
});

export const customerSchema = z.discriminatedUnion('type', [
  consumerSchema,
  soleTraderSchema,
  companySchema,
]);
export type Customer = z.infer<typeof customerSchema>;
export const customersFileSchema = z.array(customerSchema);

// ---------------------------------------------------------------------------
// data/second-life-demand.json: people waiting for a returned item.
// ---------------------------------------------------------------------------

export const secondLifeRequestSchema = z.strictObject({
  id: z.string().min(1),
  category: assetCategorySchema,
  max_monthly_net_rent_cents: centsSchema,
  /** Worst condition this person accepts. */
  min_condition: assetConditionSchema,
  preferred_term_months: z.number().int().positive(),
  needed_by: isoDateSchema,
  who: z.string(),
});
export type SecondLifeRequest = z.infer<typeof secondLifeRequestSchema>;
export const secondLifeDemandFileSchema = z.array(secondLifeRequestSchema);

// ---------------------------------------------------------------------------
// data/refurbishment-costs.json: what it costs to get a returned item ready again.
// ---------------------------------------------------------------------------

export const fixedRefurbishmentCostSchema = z.strictObject({
  id: z.string().min(1),
  cost_cents: centsSchema,
  /** When it applies, in words (e.g. "always", "usage.value >= 15000 km"). Turning this into code is yours. */
  when: z.string(),
  /** Doing this sets the usage counter back to 0 (e.g. a new battery). */
  resets_usage: z.boolean().optional(),
  /** Must be done before the item is leased again. */
  mandatory_before_next_lease: z.boolean().optional(),
});

export const categoryRefurbishmentSchema = z.strictObject({
  /** `"from->to"` condition step (e.g. "fair->good") → cost in cents. */
  condition_upgrades: z.record(z.string().regex(/^[a-z_]+->[a-z_]+$/), centsSchema),
  fixed: z.array(fixedRefurbishmentCostSchema),
});

export const refurbishmentCostsSchema = z.strictObject({
  note: z.string(),
  e_bike: categoryRefurbishmentSchema,
  laptop: categoryRefurbishmentSchema,
  farm_machine: categoryRefurbishmentSchema,
});
export type RefurbishmentCosts = z.infer<typeof refurbishmentCostsSchema>;

// ---------------------------------------------------------------------------
// data/co2-factors.json: rough (fictional) CO2 numbers for showing the impact of reuse.
// ---------------------------------------------------------------------------

export const co2FactorsSchema = z.strictObject({
  note: z.string(),
  /** kg CO2e to manufacture one new item. */
  manufacturing_new_kg: z.record(assetCategorySchema, z.number().nonnegative()),
  /** Refurbishing costs this share (0..1) of the CO2 of making a new item. */
  refurbishment_share_of_new: z.number().min(0).max(1),
  avoided_by_reuse_formula_hint: z.string(),
  /** kg CO2e saved per km cycled instead of driven. */
  e_bike_avoided_car_km_kg_per_km: z.number().nonnegative(),
});
export type Co2Factors = z.infer<typeof co2FactorsSchema>;
