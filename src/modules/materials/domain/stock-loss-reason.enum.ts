/** Why stock was lost. A closed list, so losses can be added up by reason. */
export const STOCK_LOSS_REASONS = ['BREAKAGE', 'EXPIRED', 'SPOILAGE', 'LOST', 'OTHER'] as const;

export type StockLossReason = (typeof STOCK_LOSS_REASONS)[number];
