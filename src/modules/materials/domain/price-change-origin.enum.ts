export const PRICE_CHANGE_ORIGINS = ['CREATION', 'MANUAL_EDIT', 'INVOICE_SYNC'] as const;

export type PriceChangeOrigin = (typeof PRICE_CHANGE_ORIGINS)[number];
