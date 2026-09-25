/**
 * Model name -> the field to read as `AuditLog.entityLabel`. A model absent
 * from this map gets `entityLabel: null`, never an error — adding a new
 * labeled entity is one line here, not code spread across the codebase.
 */
export const ENTITY_LABEL_FIELD: Readonly<Record<string, string>> = {
  Material: 'name',
  CompositeProduct: 'name',
  Sale: 'customerName',
  Purchase: 'merchantName',
};

export function resolveEntityLabel(
  model: string,
  row: Record<string, unknown> | null,
): string | null {
  const field = ENTITY_LABEL_FIELD[model];

  if (!field || !row) {
    return null;
  }

  const value = row[field];
  return typeof value === 'string' ? value : null;
}
