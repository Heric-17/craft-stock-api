export const PRODUCTION_STATUSES = ['PENDING', 'ASSEMBLED', 'DELIVERED'] as const;

export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];
