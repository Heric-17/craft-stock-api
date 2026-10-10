/**
 * Turns a domain error's class name into the stable code the API publishes:
 * `EntityInUseError` becomes `ENTITY_IN_USE`, `ConsumptionUnitLockedError`
 * becomes `CONSUMPTION_UNIT_LOCKED`, `HttpTransportError` becomes
 * `HTTP_TRANSPORT`.
 *
 * Derived rather than declared, so a new error class arrives with a code and
 * there is no second list to forget to update. The trade is that renaming a
 * class changes a published code — which is a contract change, and
 * docs/api-contract.md says so.
 *
 * The code exists because the messages are in English and the people using
 * this system are not: the frontend translates, and it must key that
 * translation off something that does not move when someone rewords a
 * sentence.
 */
export function toErrorCode(className: string): string {
  const withoutSuffix = className.endsWith('Error')
    ? className.slice(0, -'Error'.length)
    : className;

  return (
    withoutSuffix
      // Boundary between a lowercase or digit and the next capital:
      // `EntityInUse` -> `Entity_In_Use`, `Http` stays whole so an acronym
      // does not become `H_T_T_P`.
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .toUpperCase() || 'DOMAIN'
  );
}
