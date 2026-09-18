export const PAYMENT_STATUSES = ['PENDING', 'PAID'] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
