export const PENDING_INVOICE_STATUSES = ['PENDING', 'UNSTABLE', 'IMPORTED'] as const;

export type PendingInvoiceStatus = (typeof PENDING_INVOICE_STATUSES)[number];
