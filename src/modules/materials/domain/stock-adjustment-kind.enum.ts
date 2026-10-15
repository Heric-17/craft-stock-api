export const STOCK_ADJUSTMENT_KINDS = [
  'MANUAL_ENTRY',
  'MANUAL_LOSS',
  'MANUAL_ADJUSTMENT',
  'REVERSAL',
] as const;

export type StockAdjustmentKind = (typeof STOCK_ADJUSTMENT_KINDS)[number];
