export const DISCOUNT_ALLOCATION_MODES = [
  'PROPORTIONAL',
  'COMPANY_ONLY',
  'PERSONAL_ONLY',
  'MANUAL',
] as const;

/**
 * How the note's discount is attributed to its lines.
 *
 * The NFC-e reports a discount on the note's total and never says which item
 * it belongs to. Spreading it proportionally by default can attribute it
 * plainly wrong: on a note carrying flour at 20 (company) and wine at 100
 * (personal) with 20 of discount granted on the wine, a proportional spread
 * claims the company spent 16.67 on flour when it spent 20. The note does not
 * know, so the user decides — the same principle already applied to a
 * Material's unit and fractioning.
 */
export type DiscountAllocationMode = (typeof DISCOUNT_ALLOCATION_MODES)[number];
