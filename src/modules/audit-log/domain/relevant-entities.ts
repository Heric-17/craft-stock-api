/**
 * The entityTypes the user-facing activity feed shows. Everything else
 * written to AuditLog is real (§15.2 captures every model), just not
 * something an end user would recognize — this is the one configurable
 * list, in the one file, that decides what's "relevant to the user" instead
 * of a per-action enum.
 */
export const USER_RELEVANT_ENTITY_TYPES: readonly string[] = [
  'Material',
  'CompositeProduct',
  'Sale',
  'Purchase',
];
