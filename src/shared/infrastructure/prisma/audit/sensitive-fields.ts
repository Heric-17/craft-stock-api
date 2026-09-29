import { isSensitiveField } from '../../../domain/observability/sensitive-data';
import type { FieldChanges } from './build-field-changes';

// §16's rule — what must never be persisted or logged — is stated once, in
// domain/observability, and applied here to a diff and there to free text.
export { isSensitiveField };

/**
 * Drops sensitive fields entirely from a diff — not masked, absent — so a
 * field never even hints that it changed. Applies uniformly to every model
 * by field name; a new model with a `tokenHash` column is covered with no
 * extra code.
 */
export function omitSensitiveFields(changes: FieldChanges): FieldChanges {
  const result: FieldChanges = {};

  for (const [field, change] of Object.entries(changes)) {
    if (!isSensitiveField(field)) {
      result[field] = change;
    }
  }

  return result;
}
