import { Prisma } from '../generated/client';

export interface FieldChange {
  old: unknown;
  new: unknown;
}

export type FieldChanges = Record<string, FieldChange>;

type Row = Record<string, unknown>;

/**
 * `updatedAt` is a Prisma `@updatedAt` column: it bumps on every write
 * mechanically, whether or not any business field actually changed. Showing
 * it would mean no update is ever a true no-op (rule 3 would never trigger
 * for any model that has one), and `AuditLog.occurredAt` already records
 * when the write happened, making it redundant even when something else did
 * change. Excluded from the diff entirely, not just from the no-op check.
 */
const IGNORED_FIELDS = new Set(['updatedAt']);

/**
 * `{ field: { old, new } }` for every field that actually differs between
 * two Prisma rows of the same model. `before: null` (a CREATE) reports every
 * field of `after` as `old: null`; `after: null` (a DELETE) reports every
 * field of `before` as `new: null`. An `update` where nothing actually
 * changed returns `{}` — callers use that to skip writing a row.
 *
 * Values are compared and serialized value-wise, not by reference: Prisma
 * returns a fresh `Decimal`/`Date`/parsed-JSON object on every read, so two
 * unchanged reads are never `===` to each other.
 */
export function buildFieldChanges(before: Row | null, after: Row | null): FieldChanges {
  const fields = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const changes: FieldChanges = {};

  for (const field of fields) {
    if (IGNORED_FIELDS.has(field)) {
      continue;
    }

    const oldValue = before ? before[field] : null;
    const newValue = after ? after[field] : null;

    if (!valuesEqual(oldValue, newValue)) {
      changes[field] = { old: serialize(oldValue), new: serialize(newValue) };
    }
  }

  return changes;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }

  if (a instanceof Prisma.Decimal && b instanceof Prisma.Decimal) {
    return a.equals(b);
  }

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => valuesEqual(item, b[index]));
  }

  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);

    return aKeys.length === bKeys.length && aKeys.every((key) => valuesEqual(a[key], b[key]));
  }

  return false;
}

function serialize(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Prisma.Decimal) {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(serialize);
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, serialize(v)]));
  }

  return value;
}

function isPlainObject(value: unknown): value is Row {
  return (
    typeof value === 'object' &&
    value !== null &&
    !(value instanceof Prisma.Decimal) &&
    !(value instanceof Date) &&
    !Array.isArray(value)
  );
}
